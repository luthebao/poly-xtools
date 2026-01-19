package ports

import (
	"context"

	"xtools/internal/domain"
)

// NotificationSender defines the interface for sending notifications
type NotificationSender interface {
	// Send sends a notification with the given content
	Send(ctx context.Context, content domain.NotificationContent) error

	// SendTest sends a test notification to verify configuration
	SendTest(ctx context.Context) error

	// IsConfigured returns true if the sender is properly configured
	IsConfigured() bool

	// GetChannel returns the notification channel type
	GetChannel() domain.NotificationChannel
}

// NotificationStore defines the interface for storing notification configuration
type NotificationStore interface {
	// SaveNotificationConfig saves the notification configuration
	SaveNotificationConfig(config domain.NotificationConfig) error

	// LoadNotificationConfig loads the notification configuration
	LoadNotificationConfig() (domain.NotificationConfig, error)
}
