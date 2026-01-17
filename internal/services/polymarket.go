package services

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"xtools/internal/adapters/polymarket"
	"xtools/internal/adapters/storage"
	"xtools/internal/domain"
	"xtools/internal/ports"
)

// PolymarketService handles Polymarket event watching and storage
type PolymarketService struct {
	mu             sync.RWMutex
	store          *storage.PolymarketStore
	client         *polymarket.WebSocketClient
	walletAnalyzer *polymarket.WalletAnalyzer
	eventBus       ports.EventBus
	dbPath         string
	config         domain.PolymarketConfig
	saveFilter     domain.PolymarketEventFilter // Filter for saving events to DB
	stopCh         chan struct{}
}

// NewPolymarketService creates a new Polymarket service
func NewPolymarketService(store *storage.PolymarketStore, eventBus ports.EventBus, dbPath string) *PolymarketService {
	// Try to load config from database, fall back to defaults
	config, err := store.LoadConfig()
	if err != nil {
		log.Printf("[PolymarketService] No saved config found, using defaults")
		config = domain.DefaultPolymarketConfig()
	} else {
		log.Printf("[PolymarketService] Loaded config from database: InsiderMax=%d, WalletMax=%d, NewbieMax=%d, CustomMax=%d",
			config.FreshInsiderMaxBets, config.FreshWalletMaxBets, config.FreshNewbieMaxBets, config.CustomFreshMaxBets)
	}

	// Try to load filter from database, fall back to defaults
	saveFilter, err := store.LoadFilter()
	if err != nil {
		log.Printf("[PolymarketService] No saved filter found, using defaults")
		saveFilter = domain.PolymarketEventFilter{MinSize: 100}
	} else {
		log.Printf("[PolymarketService] Loaded filter from database: MinSize=%.0f, FreshWalletsOnly=%v",
			saveFilter.MinSize, saveFilter.FreshWalletsOnly)
	}

	svc := &PolymarketService{
		store:          store,
		eventBus:       eventBus,
		dbPath:         dbPath,
		config:         config,
		walletAnalyzer: polymarket.NewWalletAnalyzer(config, store),
		saveFilter:     saveFilter,
	}

	// Create WebSocket client with event callback
	svc.client = polymarket.NewWebSocketClient(svc.onEvent)

	return svc
}

// Start begins watching Polymarket events
func (s *PolymarketService) Start() error {
	s.mu.Lock()
	if s.stopCh != nil {
		s.mu.Unlock()
		return nil // Already running
	}
	s.stopCh = make(chan struct{})
	s.mu.Unlock()

	// Start the wallet analysis worker
	go s.walletAnalysisWorker()

	// Connect returns immediately and runs in the background
	return s.client.Connect()
}

// Stop stops watching Polymarket events
func (s *PolymarketService) Stop() {
	s.mu.Lock()
	if s.stopCh != nil {
		close(s.stopCh)
		s.stopCh = nil
	}
	s.mu.Unlock()

	if s.client != nil {
		s.client.Disconnect()
	}
}

// GetStatus returns the current watcher status
func (s *PolymarketService) GetStatus() domain.PolymarketWatcherStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.client == nil {
		return domain.PolymarketWatcherStatus{}
	}

	return s.client.GetStatus()
}

// GetEvents retrieves events with optional filtering
func (s *PolymarketService) GetEvents(filter domain.PolymarketEventFilter) ([]domain.PolymarketEvent, error) {
	return s.store.GetEvents(filter)
}

// ClearEvents removes all stored events
func (s *PolymarketService) ClearEvents() error {
	return s.store.ClearEvents()
}

// GetDatabaseInfo returns database statistics
func (s *PolymarketService) GetDatabaseInfo() (*domain.DatabaseInfo, error) {
	return s.store.GetDatabaseInfo()
}

// onEvent is called when a new event is received from WebSocket
func (s *PolymarketService) onEvent(event domain.PolymarketEvent) {
	s.mu.RLock()
	filter := s.saveFilter
	s.mu.RUnlock()

	// Check basic filters only (ignore fresh wallet filter for saving)
	if !s.matchesBasicFilter(event, filter) {
		return
	}

	// Save wallet address to DB for background analysis (if new)
	if event.WalletAddress != "" {
		isNew, err := s.store.SaveWalletAddress(event.WalletAddress)
		if err != nil {
			log.Printf("[PolymarketService] Failed to save wallet address: %v", err)
		} else if isNew {
			log.Printf("[PolymarketService] New wallet queued for analysis: %s", shortenAddress(event.WalletAddress))
		}
	}

	// Save event to DB and emit to frontend immediately
	s.saveAndEmit(event)
}

// matchesBasicFilter checks basic filter criteria (doesn't require wallet analysis)
func (s *PolymarketService) matchesBasicFilter(event domain.PolymarketEvent, filter domain.PolymarketEventFilter) bool {
	// Check minimum notional value (price * size)
	notional := parseNotionalValue(event.Price, event.Size)
	minSize := filter.MinSize
	if minSize <= 0 {
		minSize = s.config.MinTradeSize
	}
	if notional < minSize {
		return false
	}

	// Check event types
	if len(filter.EventTypes) > 0 {
		found := false
		for _, et := range filter.EventTypes {
			if et == event.EventType {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Check side
	if filter.Side != "" && string(event.Side) != string(filter.Side) {
		return false
	}

	// Check price range
	if event.Price != "" {
		var price float64
		parseFloat(event.Price, &price)
		if filter.MinPrice > 0 && price < filter.MinPrice {
			return false
		}
		if filter.MaxPrice > 0 && price > filter.MaxPrice {
			return false
		}
	}

	// Check market name (partial match)
	if filter.MarketName != "" {
		marketName := strings.ToLower(filter.MarketName)
		eventMarket := strings.ToLower(event.MarketName)
		eventTitle := strings.ToLower(event.EventTitle)
		if !strings.Contains(eventMarket, marketName) && !strings.Contains(eventTitle, marketName) {
			return false
		}
	}

	return true
}

// walletAnalysisWorker periodically processes wallets in background
func (s *PolymarketService) walletAnalysisWorker() {
	log.Println("[PolymarketService] Starting wallet analysis worker")

	// Process wallets every 10 seconds, batch of 10
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-s.stopCh:
			log.Println("[PolymarketService] Wallet analysis worker stopped")
			return
		case <-ticker.C:
			s.processWallets()
		}
	}
}

// processWallets fetches and updates wallet trade counts
func (s *PolymarketService) processWallets() {
	// Get wallets that need refresh (oldest analyzed first, includes unanalyzed)
	addresses, err := s.store.GetWalletsForRefresh(10) // Process 10 at a time
	if err != nil {
		log.Printf("[PolymarketService] Failed to get wallets for refresh: %v", err)
		return
	}

	if len(addresses) == 0 {
		return
	}

	log.Printf("[PolymarketService] Refreshing %d wallets", len(addresses))

	for _, address := range addresses {
		// Check if stopped
		select {
		case <-s.stopCh:
			return
		default:
		}

		// Fetch fresh data from API (always re-fetch, ignore cache)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		profile, err := s.walletAnalyzer.FetchAndUpdateWallet(ctx, address)
		cancel()

		if err != nil {
			log.Printf("[PolymarketService] Failed to refresh wallet %s: %v", shortenAddress(address), err)
			continue
		}

		if profile == nil || profile.BetCount < 0 {
			log.Printf("[PolymarketService] Could not get stats for wallet %s", shortenAddress(address))
			continue
		}

		// If fresh wallet, emit alert and update counter
		if profile.IsFresh {
			s.client.IncrementFreshWalletsFound()

			log.Printf("[PolymarketService] FRESH WALLET DETECTED: %s (trades=%d, joinDate=%s, level=%s)",
				shortenAddress(address),
				profile.BetCount,
				profile.JoinDate,
				profile.FreshnessLevel)

			// Emit fresh wallet alert with profile
			s.eventBus.Emit("polymarket:fresh_wallet_detected", *profile)
		}

		// Small delay between API calls to avoid rate limiting
		time.Sleep(500 * time.Millisecond)
	}
}

func (s *PolymarketService) saveAndEmit(event domain.PolymarketEvent) {
	// Save to database (async to avoid blocking)
	go func(e domain.PolymarketEvent) {
		if err := s.store.SaveEvent(e); err != nil {
			log.Printf("[PolymarketService] Failed to save event: %v", err)
		}
	}(event)

	// Emit to frontend for real-time updates
	s.eventBus.Emit("polymarket:event", event)
}

// IsRunning returns whether the watcher is currently running
func (s *PolymarketService) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.client == nil {
		return false
	}

	return s.client.IsConnected()
}

// Close shuts down the service
func (s *PolymarketService) Close() {
	s.Stop()
	if s.store != nil {
		s.store.Close()
	}
}

// UpdateConfig updates the service configuration and saves to database
func (s *PolymarketService) UpdateConfig(config domain.PolymarketConfig) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.config = config
	s.walletAnalyzer = polymarket.NewWalletAnalyzer(config, s.store)

	// Save to database
	if err := s.store.SaveConfig(config); err != nil {
		log.Printf("[PolymarketService] Failed to save config: %v", err)
	} else {
		log.Printf("[PolymarketService] Config saved to database: InsiderMax=%d, WalletMax=%d, NewbieMax=%d, CustomMax=%d",
			config.FreshInsiderMaxBets, config.FreshWalletMaxBets, config.FreshNewbieMaxBets, config.CustomFreshMaxBets)
	}
}

// GetConfig returns the current configuration
func (s *PolymarketService) GetConfig() domain.PolymarketConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config
}

// SetSaveFilter sets the filter for saving events to database and persists it
func (s *PolymarketService) SetSaveFilter(filter domain.PolymarketEventFilter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.saveFilter = filter

	// Save to database
	if err := s.store.SaveFilter(filter); err != nil {
		log.Printf("[PolymarketService] Failed to save filter: %v", err)
	} else {
		log.Printf("[PolymarketService] Filter saved to database: minSize=%.0f, side=%s, freshWalletsOnly=%v",
			filter.MinSize, filter.Side, filter.FreshWalletsOnly)
	}
}

// GetSaveFilter returns the current save filter
func (s *PolymarketService) GetSaveFilter() domain.PolymarketEventFilter {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.saveFilter
}

// GetWallets retrieves all wallets from the database
func (s *PolymarketService) GetWallets(limit int) ([]domain.WalletProfile, error) {
	return s.store.GetAllWallets(limit)
}

// Helper functions

func shortenAddress(addr string) string {
	if len(addr) <= 10 {
		return addr
	}
	return addr[:6] + "..." + addr[len(addr)-4:]
}

func parseNotionalValue(price, size string) float64 {
	if price == "" || size == "" {
		return 0
	}

	var p, s float64
	if _, err := parseFloat(price, &p); err != nil {
		return 0
	}
	if _, err := parseFloat(size, &s); err != nil {
		return 0
	}
	return p * s
}

func parseFloat(str string, v *float64) (bool, error) {
	if str == "" {
		return false, nil
	}
	var val float64
	_, err := formatScan(str, &val)
	if err != nil {
		return false, err
	}
	*v = val
	return true, nil
}

func formatScan(str string, v *float64) (int, error) {
	// Simple float parser
	val := 0.0
	multiplier := 1.0
	decimal := false
	decimalPlace := 0.1

	for _, c := range str {
		if c == '-' {
			multiplier = -1
		} else if c == '.' {
			decimal = true
		} else if c >= '0' && c <= '9' {
			digit := float64(c - '0')
			if decimal {
				val += digit * decimalPlace
				decimalPlace /= 10
			} else {
				val = val*10 + digit
			}
		}
	}

	*v = val * multiplier
	return 1, nil
}
