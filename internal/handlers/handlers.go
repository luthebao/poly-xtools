package handlers

import (
	"context"
	"fmt"
	"time"

	"xtools/internal/adapters/twitter"
	"xtools/internal/adapters/updater"
	"xtools/internal/domain"
	"xtools/internal/ports"
	"xtools/internal/services"
	"xtools/internal/workers"
)

// Handlers provides all Wails-bound handler methods
type Handlers struct {
	accountSvc     *services.AccountService
	searchSvc      *services.SearchService
	replySvc       *services.ReplyService
	polymarketSvc  *services.PolymarketService
	workerPool     *workers.WorkerPool
	configStore    ports.ConfigStore
	metricsStore   ports.MetricsStore
	excelExporter  ports.ExcelExporter
	activityLogger ports.ActivityLogger
	updater        *updater.Updater
}

// NewHandlers creates a new handlers instance
func NewHandlers(
	accountSvc *services.AccountService,
	searchSvc *services.SearchService,
	replySvc *services.ReplyService,
	polymarketSvc *services.PolymarketService,
	workerPool *workers.WorkerPool,
	configStore ports.ConfigStore,
	metricsStore ports.MetricsStore,
	excelExporter ports.ExcelExporter,
	activityLogger ports.ActivityLogger,
) *Handlers {
	return &Handlers{
		accountSvc:     accountSvc,
		searchSvc:      searchSvc,
		replySvc:       replySvc,
		polymarketSvc:  polymarketSvc,
		workerPool:     workerPool,
		configStore:    configStore,
		metricsStore:   metricsStore,
		excelExporter:  excelExporter,
		activityLogger: activityLogger,
		updater:        updater.NewUpdater(),
	}
}

// === Account Handlers ===

// GetAccounts returns all account configurations
func (h *Handlers) GetAccounts() ([]domain.AccountConfig, error) {
	return h.accountSvc.ListAccounts()
}

// GetAccount returns a single account configuration
func (h *Handlers) GetAccount(accountID string) (*domain.AccountConfig, error) {
	return h.accountSvc.GetAccount(accountID)
}

// CreateAccount creates a new account
func (h *Handlers) CreateAccount(cfg domain.AccountConfig) error {
	return h.accountSvc.CreateAccount(cfg)
}

// UpdateAccount updates an existing account
func (h *Handlers) UpdateAccount(cfg domain.AccountConfig) error {
	// Check if worker is running before update
	wasRunning := h.workerPool.IsRunning(cfg.ID)

	if err := h.accountSvc.UpdateAccount(cfg); err != nil {
		return err
	}

	// Restart worker if it was running to apply new config
	if wasRunning {
		h.activityLogger.Log(cfg.ID, domain.ActivityTypeConfig, domain.ActivityLevelInfo, "Config updated, restarting worker", "")
		if err := h.workerPool.RestartWorker(cfg.ID); err != nil {
			h.activityLogger.Log(cfg.ID, domain.ActivityTypeWorker, domain.ActivityLevelError, "Failed to restart worker after config update", err.Error())
			// Don't return error - config was saved successfully
		}
	}

	return nil
}

// DeleteAccount removes an account
func (h *Handlers) DeleteAccount(accountID string) error {
	h.workerPool.StopWorker(accountID)
	return h.accountSvc.DeleteAccount(accountID)
}

// ReloadAccount reloads account config from disk
func (h *Handlers) ReloadAccount(accountID string) (*domain.AccountConfig, error) {
	return h.accountSvc.ReloadAccount(accountID)
}

// TestAccountConnection tests Twitter connection
func (h *Handlers) TestAccountConnection(accountID string) error {
	return h.accountSvc.TestConnection(accountID)
}

// GetAccountStatus returns account status
func (h *Handlers) GetAccountStatus(accountID string) domain.AccountStatus {
	status := h.accountSvc.GetAccountStatus(accountID)
	status.IsRunning = h.workerPool.IsRunning(accountID)
	return status
}

// === Worker Handlers ===

// StartAccount starts the worker for an account
func (h *Handlers) StartAccount(accountID string) error {
	h.activityLogger.Log(accountID, domain.ActivityTypeWorker, domain.ActivityLevelInfo, "Starting worker", "")
	err := h.workerPool.StartWorker(accountID)
	if err != nil {
		h.activityLogger.Log(accountID, domain.ActivityTypeWorker, domain.ActivityLevelError, "Failed to start worker", err.Error())
		return err
	}
	h.activityLogger.Log(accountID, domain.ActivityTypeWorker, domain.ActivityLevelSuccess, "Worker started", "")
	return nil
}

// StopAccount stops the worker for an account
func (h *Handlers) StopAccount(accountID string) error {
	h.activityLogger.Log(accountID, domain.ActivityTypeWorker, domain.ActivityLevelInfo, "Stopping worker", "")
	err := h.workerPool.StopWorker(accountID)
	if err != nil {
		h.activityLogger.Log(accountID, domain.ActivityTypeWorker, domain.ActivityLevelError, "Failed to stop worker", err.Error())
		return err
	}
	h.activityLogger.Log(accountID, domain.ActivityTypeWorker, domain.ActivityLevelSuccess, "Worker stopped", "")
	return nil
}

// RestartAccount restarts the worker
func (h *Handlers) RestartAccount(accountID string) error {
	return h.workerPool.RestartWorker(accountID)
}

// GetWorkerStatus returns status of all workers
func (h *Handlers) GetWorkerStatus() map[string]bool {
	return h.workerPool.GetStatus()
}

// === Search Handlers ===

// SearchTweets manually triggers a search
func (h *Handlers) SearchTweets(accountID string) ([]domain.Tweet, error) {
	h.activityLogger.Log(accountID, domain.ActivityTypeSearch, domain.ActivityLevelInfo, "Starting keyword search", "")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	tweets, err := h.searchSvc.SearchTweets(ctx, accountID)
	if err != nil {
		h.activityLogger.Log(accountID, domain.ActivityTypeSearch, domain.ActivityLevelError, "Search failed", err.Error())
		return nil, err
	}

	h.activityLogger.Log(accountID, domain.ActivityTypeSearch, domain.ActivityLevelSuccess, "Search completed", fmt.Sprintf("Found %d tweets", len(tweets)))
	return tweets, nil
}

// ManualSearch performs a custom search
func (h *Handlers) ManualSearch(accountID, query string, maxResults int) ([]domain.Tweet, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return h.searchSvc.ManualSearch(ctx, accountID, query, maxResults)
}

// GetTweetDetails returns tweet with thread context
func (h *Handlers) GetTweetDetails(accountID, tweetID string) (*domain.Tweet, []domain.Tweet, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return h.searchSvc.GetTweetDetails(ctx, accountID, tweetID)
}

// === Reply Handlers ===

// GetPendingReplies returns pending approval queue
func (h *Handlers) GetPendingReplies(accountID string) ([]domain.ApprovalQueueItem, error) {
	return h.replySvc.GetPendingReplies(accountID)
}

// ApproveReply approves a pending reply
func (h *Handlers) ApproveReply(replyID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	return h.replySvc.ApproveReply(ctx, replyID)
}

// RejectReply rejects a pending reply
func (h *Handlers) RejectReply(replyID string) error {
	return h.replySvc.RejectReply(replyID)
}

// EditReply updates a pending reply's text
func (h *Handlers) EditReply(replyID, newText string) error {
	return h.replySvc.EditReply(replyID, newText)
}

// GetReplyHistory returns reply history for an account
func (h *Handlers) GetReplyHistory(accountID string, limit int) ([]domain.Reply, error) {
	return h.replySvc.GetReplyHistory(accountID, limit)
}

// GenerateReply manually generates a reply for a tweet
func (h *Handlers) GenerateReply(accountID string, tweet domain.Tweet) (*domain.Reply, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	return h.replySvc.GenerateReply(ctx, accountID, tweet)
}

// === Metrics Handlers ===

// GetProfileHistory returns profile metrics history
func (h *Handlers) GetProfileHistory(accountID string, days int) ([]domain.ProfileSnapshot, error) {
	return h.metricsStore.GetProfileHistory(accountID, days)
}

// GetReplyPerformance returns reply performance report
func (h *Handlers) GetReplyPerformance(accountID string, days int) (*domain.ReplyPerformanceReport, error) {
	return h.metricsStore.GetReplyPerformance(accountID, days)
}

// GetDailyStats returns daily statistics
func (h *Handlers) GetDailyStats(accountID string, days int) ([]domain.DailyStats, error) {
	return h.metricsStore.GetDailyStats(accountID, days)
}

// === Export Handlers ===

// ExportTweets exports tweets to Excel
func (h *Handlers) ExportTweets(accountID, path string) error {
	tweets, err := h.excelExporter.LoadTweets(h.excelExporter.GetExportPath(accountID))
	if err != nil {
		return err
	}
	return h.excelExporter.ExportTweets(accountID, tweets, path)
}

// GetExportPath returns the export path for an account
func (h *Handlers) GetExportPath(accountID string) string {
	return h.excelExporter.GetExportPath(accountID)
}

// GetConfigPath returns the config path for an account
func (h *Handlers) GetConfigPath(accountID string) string {
	return h.configStore.GetConfigPath(accountID)
}

// === Cookie Extraction Handlers ===

// ExtractCookies opens browser for Twitter login and extracts cookies
func (h *Handlers) ExtractCookies() (*domain.BrowserAuth, error) {
	extractor := twitter.NewCookieExtractor()
	defer extractor.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	return extractor.ExtractCookies(ctx)
}

// SaveBrowserAuth updates an account with browser auth credentials
func (h *Handlers) SaveBrowserAuth(accountID string, auth domain.BrowserAuth) error {
	cfg, err := h.configStore.LoadAccount(accountID)
	if err != nil {
		return err
	}

	cfg.AuthType = domain.AuthTypeBrowser
	cfg.BrowserAuth = &auth

	h.activityLogger.Log(accountID, domain.ActivityTypeConfig, domain.ActivityLevelSuccess, "Browser auth saved", "Switched to browser authentication mode")
	return h.configStore.SaveAccount(*cfg)
}

// === Activity Log Handlers ===

// GetActivityLogs returns activity logs for an account
func (h *Handlers) GetActivityLogs(accountID string, limit int) []domain.ActivityLog {
	if limit <= 0 {
		limit = 100
	}
	return h.activityLogger.GetLogs(accountID, limit)
}

// GetAllActivityLogs returns all activity logs
func (h *Handlers) GetAllActivityLogs(limit int) []domain.ActivityLog {
	if limit <= 0 {
		limit = 200
	}
	return h.activityLogger.GetAllLogs(limit)
}

// ClearActivityLogs clears logs for an account
func (h *Handlers) ClearActivityLogs(accountID string) {
	h.activityLogger.ClearLogs(accountID)
}

// LogActivity manually logs an activity (useful for frontend logging)
func (h *Handlers) LogActivity(accountID string, actType string, level string, message string) {
	h.activityLogger.Log(accountID, domain.ActivityType(actType), domain.ActivityLevel(level), message, "")
}

// === Update Handlers ===

// CheckForUpdates checks GitHub for the latest release
func (h *Handlers) CheckForUpdates() (*updater.UpdateInfo, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return h.updater.CheckForUpdates(ctx)
}

// GetAppVersion returns the current application version
func (h *Handlers) GetAppVersion() string {
	return h.updater.GetCurrentVersion()
}

// === Polymarket Handlers ===

// StartPolymarketWatcher starts the Polymarket WebSocket watcher
func (h *Handlers) StartPolymarketWatcher() error {
	if h.polymarketSvc == nil {
		return fmt.Errorf("polymarket service not initialized")
	}
	return h.polymarketSvc.Start()
}

// StopPolymarketWatcher stops the Polymarket WebSocket watcher
func (h *Handlers) StopPolymarketWatcher() {
	if h.polymarketSvc != nil {
		h.polymarketSvc.Stop()
	}
}

// GetPolymarketWatcherStatus returns the current watcher status
func (h *Handlers) GetPolymarketWatcherStatus() domain.PolymarketWatcherStatus {
	if h.polymarketSvc == nil {
		return domain.PolymarketWatcherStatus{}
	}
	return h.polymarketSvc.GetStatus()
}

// GetPolymarketEvents returns Polymarket events with optional filtering
func (h *Handlers) GetPolymarketEvents(filter domain.PolymarketEventFilter) ([]domain.PolymarketEvent, error) {
	if h.polymarketSvc == nil {
		return nil, fmt.Errorf("polymarket service not initialized")
	}
	return h.polymarketSvc.GetEvents(filter)
}

// ClearPolymarketEvents removes all stored Polymarket events
func (h *Handlers) ClearPolymarketEvents() error {
	if h.polymarketSvc == nil {
		return fmt.Errorf("polymarket service not initialized")
	}
	return h.polymarketSvc.ClearEvents()
}

// GetDatabaseInfo returns database statistics
func (h *Handlers) GetDatabaseInfo() (*domain.DatabaseInfo, error) {
	if h.polymarketSvc == nil {
		return nil, fmt.Errorf("polymarket service not initialized")
	}
	return h.polymarketSvc.GetDatabaseInfo()
}

// SetPolymarketSaveFilter sets the filter for saving events to database
func (h *Handlers) SetPolymarketSaveFilter(filter domain.PolymarketEventFilter) {
	if h.polymarketSvc != nil {
		h.polymarketSvc.SetSaveFilter(filter)
	}
}

// GetPolymarketSaveFilter returns the current save filter
func (h *Handlers) GetPolymarketSaveFilter() domain.PolymarketEventFilter {
	if h.polymarketSvc == nil {
		return domain.PolymarketEventFilter{}
	}
	return h.polymarketSvc.GetSaveFilter()
}

// GetPolymarketConfig returns the current Polymarket configuration
func (h *Handlers) GetPolymarketConfig() domain.PolymarketConfig {
	if h.polymarketSvc == nil {
		return domain.DefaultPolymarketConfig()
	}
	return h.polymarketSvc.GetConfig()
}

// SetPolymarketConfig updates the Polymarket configuration
func (h *Handlers) SetPolymarketConfig(config domain.PolymarketConfig) {
	if h.polymarketSvc != nil {
		h.polymarketSvc.UpdateConfig(config)
	}
}

// GetPolymarketWallets returns all wallets from the database
func (h *Handlers) GetPolymarketWallets(limit int) ([]domain.WalletProfile, error) {
	if h.polymarketSvc == nil {
		return nil, fmt.Errorf("polymarket service not initialized")
	}
	return h.polymarketSvc.GetWallets(limit)
}
