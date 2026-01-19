package services

import (
	"context"
	"log"
	"sync"
	"time"

	"xtools/internal/adapters/notification"
	"xtools/internal/domain"
	"xtools/internal/ports"
)

// NotificationService handles notification orchestration
type NotificationService struct {
	mu        sync.RWMutex
	config    domain.NotificationConfig
	store     ports.NotificationStore
	eventBus  ports.EventBus
	telegram  *notification.TelegramNotifier
	stopCh    chan struct{}

	// Track notified wallets to prevent duplicate fresh wallet notifications
	notifiedWallets     map[string]bool
	notifiedWalletsMu   sync.RWMutex
}

// NewNotificationService creates a new notification service
func NewNotificationService(store ports.NotificationStore, eventBus ports.EventBus) *NotificationService {
	// Load config from database
	config, err := store.LoadNotificationConfig()
	if err != nil {
		log.Printf("[NotificationService] No saved config found, using defaults")
		config = domain.DefaultNotificationConfig()
	} else {
		log.Printf("[NotificationService] Loaded config: Enabled=%v, BigTrades=%v, FreshWallets=%v",
			config.Enabled, config.NotifyBigTrades, config.NotifyFreshWallets)
	}

	svc := &NotificationService{
		config:          config,
		store:           store,
		eventBus:        eventBus,
		telegram:        notification.NewTelegramNotifier(config.TelegramBotToken, config.TelegramChatIDs),
		notifiedWallets: make(map[string]bool),
	}

	return svc
}

// Start begins listening for notification events
func (s *NotificationService) Start() {
	s.mu.Lock()
	if s.stopCh != nil {
		s.mu.Unlock()
		return // Already running
	}
	s.stopCh = make(chan struct{})
	s.mu.Unlock()

	log.Println("[NotificationService] Starting notification service")

	// Subscribe to polymarket events
	s.eventBus.Subscribe("polymarket:event", s.handlePolymarketEvent)
	s.eventBus.Subscribe("polymarket:fresh_wallet_detected", s.handleFreshWalletDetected)
}

// Stop stops the notification service
func (s *NotificationService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.stopCh != nil {
		close(s.stopCh)
		s.stopCh = nil
	}

	log.Println("[NotificationService] Stopped notification service")
}

// GetConfig returns the current notification configuration
func (s *NotificationService) GetConfig() domain.NotificationConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config
}

// UpdateConfig updates the notification configuration
func (s *NotificationService) UpdateConfig(config domain.NotificationConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.config = config
	s.telegram.UpdateConfig(config.TelegramBotToken, config.TelegramChatIDs)

	// Save to database
	if err := s.store.SaveNotificationConfig(config); err != nil {
		log.Printf("[NotificationService] Failed to save config: %v", err)
		return err
	}

	log.Printf("[NotificationService] Config updated: Enabled=%v, BigTrades=%v, FreshWallets=%v",
		config.Enabled, config.NotifyBigTrades, config.NotifyFreshWallets)

	return nil
}

// SendTestNotification sends a test notification
func (s *NotificationService) SendTestNotification(ctx context.Context) error {
	s.mu.RLock()
	config := s.config
	s.mu.RUnlock()

	if !config.Enabled {
		return &notification.NotificationError{Message: "Notifications are not enabled"}
	}

	if !config.IsConfigured() {
		return &notification.NotificationError{Message: "Telegram is not configured. Please provide bot token and chat ID."}
	}

	return s.telegram.SendTest(ctx)
}

// handlePolymarketEvent handles incoming Polymarket trade events
func (s *NotificationService) handlePolymarketEvent(data interface{}) {
	event, ok := data.(domain.PolymarketEvent)
	if !ok {
		return
	}

	s.mu.RLock()
	config := s.config
	s.mu.RUnlock()

	// Check if big trade notifications are enabled
	if !config.Enabled || !config.NotifyBigTrades {
		return
	}

	// Send big trade notification
	content := domain.NewBigTradeNotification(event)
	s.sendNotificationAsync(content)
}

// handleFreshWalletDetected handles fresh wallet detection events
func (s *NotificationService) handleFreshWalletDetected(data interface{}) {
	profile, ok := data.(domain.WalletProfile)
	if !ok {
		return
	}

	s.mu.RLock()
	config := s.config
	s.mu.RUnlock()

	// Check if fresh wallet notifications are enabled
	if !config.Enabled || !config.NotifyFreshWallets {
		return
	}

	// Check if we already notified for this wallet (first-time only)
	s.notifiedWalletsMu.Lock()
	walletKey := profile.Address
	if s.notifiedWallets[walletKey] {
		s.notifiedWalletsMu.Unlock()
		return // Already notified for this wallet
	}
	s.notifiedWallets[walletKey] = true
	s.notifiedWalletsMu.Unlock()

	// Send fresh wallet notification
	content := domain.NewFreshWalletNotification(profile)
	s.sendNotificationAsync(content)
}

// sendNotificationAsync sends a notification asynchronously
func (s *NotificationService) sendNotificationAsync(content domain.NotificationContent) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := s.telegram.Send(ctx, content); err != nil {
			log.Printf("[NotificationService] Failed to send notification: %v", err)
		}
	}()
}

// ClearNotifiedWallets clears the notified wallets cache
// (useful for testing or when user wants to re-enable notifications)
func (s *NotificationService) ClearNotifiedWallets() {
	s.notifiedWalletsMu.Lock()
	s.notifiedWallets = make(map[string]bool)
	s.notifiedWalletsMu.Unlock()
	log.Println("[NotificationService] Cleared notified wallets cache")
}

// IsConfigured returns true if notifications are configured and enabled
func (s *NotificationService) IsConfigured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.IsConfigured()
}
