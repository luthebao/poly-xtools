package main

import (
	"context"
	"database/sql"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"xtools/internal/adapters/activity"
	"xtools/internal/adapters/events"
	"xtools/internal/adapters/llm"
	"xtools/internal/adapters/storage"
	"xtools/internal/adapters/twitter"
	"xtools/internal/adapters/updater"
	"xtools/internal/domain"
	"xtools/internal/handlers"
	"xtools/internal/services"
	"xtools/internal/workers"
)

// App struct holds all application dependencies
type App struct {
	ctx context.Context

	// Event bus
	eventBus *events.WailsEventBus

	// Activity logger
	activityLogger *activity.InMemoryLogger

	// Storage
	configStore      *storage.YAMLConfigStore
	metricsStore     *storage.SQLiteMetricsStore
	replyStore       *storage.SQLiteReplyStore
	polymarketStore  *storage.PolymarketStore
	excelExporter    *storage.ExcelExporter

	// Services
	accountSvc      *services.AccountService
	searchSvc       *services.SearchService
	replySvc        *services.ReplyService
	polymarketSvc   *services.PolymarketService
	notificationSvc *services.NotificationService

	// Workers
	workerPool *workers.WorkerPool

	// Handlers (exposed to frontend)
	handlers *handlers.Handlers
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// getDataDir returns the OS-specific application data directory
func getDataDir() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		// Fallback to current directory if UserConfigDir fails
		return "./data"
	}
	return filepath.Join(configDir, "XTools")
}

// openFolder opens a folder in the system file explorer
func openFolder(path string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", path)
	case "windows":
		cmd = exec.Command("explorer", path)
	default: // linux and others
		cmd = exec.Command("xdg-open", path)
	}
	return cmd.Start()
}

// startup is called at application startup
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Initialize data directories
	// Use OS-specific application data directory:
	// - macOS: ~/Library/Application Support/XTools
	// - Windows: %AppData%/XTools
	// - Linux: ~/.config/XTools
	dataDir := getDataDir()
	accountsDir := filepath.Join(dataDir, "accounts")
	exportsDir := filepath.Join(dataDir, "exports")
	dbPath := filepath.Join(dataDir, "xtools.db")

	// Ensure directories exist
	os.MkdirAll(accountsDir, 0755)
	os.MkdirAll(exportsDir, 0755)

	// Initialize event bus
	a.eventBus = events.NewWailsEventBus(ctx)

	// Initialize activity logger
	a.activityLogger = activity.NewInMemoryLogger(a.eventBus)

	// Initialize storage
	var err error
	a.configStore, err = storage.NewYAMLConfigStore(accountsDir)
	if err != nil {
		println("Failed to initialize config store:", err.Error())
	}

	a.metricsStore, err = storage.NewSQLiteMetricsStore(dbPath)
	if err != nil {
		println("Failed to initialize metrics store:", err.Error())
	}

	// Open DB for reply store
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err == nil {
		a.replyStore, _ = storage.NewSQLiteReplyStore(db)
	}

	a.excelExporter, err = storage.NewExcelExporter(exportsDir)
	if err != nil {
		println("Failed to initialize excel exporter:", err.Error())
	}

	a.polymarketStore, err = storage.NewPolymarketStore(dbPath)
	if err != nil {
		println("Failed to initialize polymarket store:", err.Error())
	}

	// Initialize services
	clientFactory := twitter.NewClientFactory()
	llmFactory := llm.NewProviderFactory()

	a.accountSvc = services.NewAccountService(a.configStore, clientFactory, a.eventBus)
	a.searchSvc = services.NewSearchService(a.accountSvc, a.metricsStore, a.excelExporter, a.eventBus)
	a.replySvc = services.NewReplyService(a.accountSvc, a.searchSvc, llmFactory, a.replyStore, a.metricsStore, a.eventBus, a.activityLogger)
	a.polymarketSvc = services.NewPolymarketService(a.polymarketStore, a.eventBus, dbPath)
	a.notificationSvc = services.NewNotificationService(a.polymarketStore, a.eventBus)

	// Start notification service to listen for events
	a.notificationSvc.Start()

	// Initialize worker pool
	a.workerPool = workers.NewWorkerPool(a.searchSvc, a.replySvc, a.configStore, a.eventBus, a.activityLogger)

	// Initialize handlers
	a.handlers = handlers.NewHandlers(
		a.accountSvc,
		a.searchSvc,
		a.replySvc,
		a.polymarketSvc,
		a.notificationSvc,
		a.workerPool,
		a.configStore,
		a.metricsStore,
		a.excelExporter,
		a.activityLogger,
	)

	// Create example config if no accounts exist
	accounts, _ := a.configStore.ListAccounts()
	if len(accounts) == 0 {
		a.configStore.CreateExampleConfig()
	}
}

// domReady is called after front-end resources have been loaded
func (a App) domReady(ctx context.Context) {
	// Start workers for enabled accounts
	a.workerPool.StartAll()
}

// beforeClose is called when the application is about to quit
func (a *App) beforeClose(ctx context.Context) (prevent bool) {
	// Stop all workers gracefully
	a.workerPool.StopAll()
	return false
}

// shutdown is called at application termination
func (a *App) shutdown(ctx context.Context) {
	// Close services
	if a.accountSvc != nil {
		a.accountSvc.Close()
	}
	if a.metricsStore != nil {
		a.metricsStore.Close()
	}
	if a.polymarketSvc != nil {
		a.polymarketSvc.Close()
	}
	if a.notificationSvc != nil {
		a.notificationSvc.Stop()
	}
}

// === Exposed Methods (Wails Bindings) ===

// GetAccounts returns all account configurations
func (a *App) GetAccounts() ([]domain.AccountConfig, error) {
	return a.handlers.GetAccounts()
}

// GetAccount returns a single account
func (a *App) GetAccount(accountID string) (*domain.AccountConfig, error) {
	return a.handlers.GetAccount(accountID)
}

// CreateAccount creates a new account
func (a *App) CreateAccount(cfg domain.AccountConfig) error {
	return a.handlers.CreateAccount(cfg)
}

// UpdateAccount updates an account
func (a *App) UpdateAccount(cfg domain.AccountConfig) error {
	return a.handlers.UpdateAccount(cfg)
}

// DeleteAccount deletes an account
func (a *App) DeleteAccount(accountID string) error {
	return a.handlers.DeleteAccount(accountID)
}

// ReloadAccount reloads account from disk
func (a *App) ReloadAccount(accountID string) (*domain.AccountConfig, error) {
	return a.handlers.ReloadAccount(accountID)
}

// TestAccountConnection tests the connection
func (a *App) TestAccountConnection(accountID string) error {
	return a.handlers.TestAccountConnection(accountID)
}

// GetAccountStatus returns account status
func (a *App) GetAccountStatus(accountID string) domain.AccountStatus {
	return a.handlers.GetAccountStatus(accountID)
}

// StartAccount starts the worker
func (a *App) StartAccount(accountID string) error {
	return a.handlers.StartAccount(accountID)
}

// StopAccount stops the worker
func (a *App) StopAccount(accountID string) error {
	return a.handlers.StopAccount(accountID)
}

// RestartAccount restarts the worker
func (a *App) RestartAccount(accountID string) error {
	return a.handlers.RestartAccount(accountID)
}

// GetWorkerStatus returns worker status
func (a *App) GetWorkerStatus() map[string]bool {
	return a.handlers.GetWorkerStatus()
}

// SearchTweets triggers a manual search
func (a *App) SearchTweets(accountID string) ([]domain.Tweet, error) {
	return a.handlers.SearchTweets(accountID)
}

// ManualSearch performs a custom search
func (a *App) ManualSearch(accountID, query string, maxResults int) ([]domain.Tweet, error) {
	return a.handlers.ManualSearch(accountID, query, maxResults)
}

// GetTweetDetails returns tweet with thread
func (a *App) GetTweetDetails(accountID, tweetID string) (*domain.Tweet, []domain.Tweet, error) {
	return a.handlers.GetTweetDetails(accountID, tweetID)
}

// GetPendingReplies returns approval queue
func (a *App) GetPendingReplies(accountID string) ([]domain.ApprovalQueueItem, error) {
	return a.handlers.GetPendingReplies(accountID)
}

// ApproveReply approves a reply
func (a *App) ApproveReply(replyID string) error {
	return a.handlers.ApproveReply(replyID)
}

// RejectReply rejects a reply
func (a *App) RejectReply(replyID string) error {
	return a.handlers.RejectReply(replyID)
}

// EditReply edits a pending reply
func (a *App) EditReply(replyID, newText string) error {
	return a.handlers.EditReply(replyID, newText)
}

// GetReplyHistory returns reply history
func (a *App) GetReplyHistory(accountID string, limit int) ([]domain.Reply, error) {
	return a.handlers.GetReplyHistory(accountID, limit)
}

// GenerateReply generates a reply for a tweet
func (a *App) GenerateReply(accountID string, tweet domain.Tweet) (*domain.Reply, error) {
	return a.handlers.GenerateReply(accountID, tweet)
}

// GetProfileHistory returns profile metrics
func (a *App) GetProfileHistory(accountID string, days int) ([]domain.ProfileSnapshot, error) {
	return a.handlers.GetProfileHistory(accountID, days)
}

// GetReplyPerformance returns reply analytics
func (a *App) GetReplyPerformance(accountID string, days int) (*domain.ReplyPerformanceReport, error) {
	return a.handlers.GetReplyPerformance(accountID, days)
}

// GetDailyStats returns daily statistics
func (a *App) GetDailyStats(accountID string, days int) ([]domain.DailyStats, error) {
	return a.handlers.GetDailyStats(accountID, days)
}

// ExportTweets exports tweets to Excel
func (a *App) ExportTweets(accountID, path string) error {
	return a.handlers.ExportTweets(accountID, path)
}

// GetExportPath returns export file path
func (a *App) GetExportPath(accountID string) string {
	return a.handlers.GetExportPath(accountID)
}

// GetConfigPath returns config file path
func (a *App) GetConfigPath(accountID string) string {
	return a.handlers.GetConfigPath(accountID)
}

// ExtractCookies opens browser for Twitter login and extracts cookies
func (a *App) ExtractCookies() (*domain.BrowserAuth, error) {
	return a.handlers.ExtractCookies()
}

// SaveBrowserAuth saves browser auth credentials to an account
func (a *App) SaveBrowserAuth(accountID string, auth domain.BrowserAuth) error {
	return a.handlers.SaveBrowserAuth(accountID, auth)
}

// GetActivityLogs returns activity logs for an account
func (a *App) GetActivityLogs(accountID string, limit int) []domain.ActivityLog {
	return a.handlers.GetActivityLogs(accountID, limit)
}

// GetAllActivityLogs returns all activity logs
func (a *App) GetAllActivityLogs(limit int) []domain.ActivityLog {
	return a.handlers.GetAllActivityLogs(limit)
}

// ClearActivityLogs clears activity logs for an account
func (a *App) ClearActivityLogs(accountID string) {
	a.handlers.ClearActivityLogs(accountID)
}

// GetDataDir returns the application data directory path
func (a *App) GetDataDir() string {
	return getDataDir()
}

// OpenFolder opens a folder in the system file explorer
func (a *App) OpenFolder(path string) error {
	return openFolder(path)
}

// CheckForUpdates checks GitHub for the latest release
func (a *App) CheckForUpdates() (*updater.UpdateInfo, error) {
	return a.handlers.CheckForUpdates()
}

// GetAppVersion returns the current application version
func (a *App) GetAppVersion() string {
	return a.handlers.GetAppVersion()
}

// === Polymarket Bindings ===

// StartPolymarketWatcher starts the Polymarket WebSocket watcher
func (a *App) StartPolymarketWatcher() error {
	return a.handlers.StartPolymarketWatcher()
}

// StopPolymarketWatcher stops the Polymarket WebSocket watcher
func (a *App) StopPolymarketWatcher() {
	a.handlers.StopPolymarketWatcher()
}

// GetPolymarketWatcherStatus returns the current watcher status
func (a *App) GetPolymarketWatcherStatus() domain.PolymarketWatcherStatus {
	return a.handlers.GetPolymarketWatcherStatus()
}

// GetPolymarketEvents returns Polymarket events with optional filtering
func (a *App) GetPolymarketEvents(filter domain.PolymarketEventFilter) ([]domain.PolymarketEvent, error) {
	return a.handlers.GetPolymarketEvents(filter)
}

// ClearPolymarketEvents removes all stored Polymarket events
func (a *App) ClearPolymarketEvents() error {
	return a.handlers.ClearPolymarketEvents()
}

// GetDatabaseInfo returns database statistics
func (a *App) GetDatabaseInfo() (*domain.DatabaseInfo, error) {
	return a.handlers.GetDatabaseInfo()
}

// SetPolymarketSaveFilter sets the filter for saving events to database
func (a *App) SetPolymarketSaveFilter(filter domain.PolymarketEventFilter) {
	a.handlers.SetPolymarketSaveFilter(filter)
}

// GetPolymarketSaveFilter returns the current save filter
func (a *App) GetPolymarketSaveFilter() domain.PolymarketEventFilter {
	return a.handlers.GetPolymarketSaveFilter()
}

// GetPolymarketConfig returns the current Polymarket configuration
func (a *App) GetPolymarketConfig() domain.PolymarketConfig {
	return a.handlers.GetPolymarketConfig()
}

// SetPolymarketConfig updates the Polymarket configuration
func (a *App) SetPolymarketConfig(config domain.PolymarketConfig) {
	a.handlers.SetPolymarketConfig(config)
}

// GetPolymarketWallets returns all wallets from the database
func (a *App) GetPolymarketWallets(limit int) ([]domain.WalletProfile, error) {
	return a.handlers.GetPolymarketWallets(limit)
}

// === Notification Bindings ===

// GetNotificationConfig returns the current notification configuration
func (a *App) GetNotificationConfig() domain.NotificationConfig {
	return a.handlers.GetNotificationConfig()
}

// SetNotificationConfig updates the notification configuration
func (a *App) SetNotificationConfig(config domain.NotificationConfig) error {
	return a.handlers.SetNotificationConfig(config)
}

// SendTestNotification sends a test notification
func (a *App) SendTestNotification() error {
	return a.handlers.SendTestNotification()
}
