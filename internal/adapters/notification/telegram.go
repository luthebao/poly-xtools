package notification

import (
	"context"
	"log"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"

	"xtools/internal/domain"
)

// TelegramNotifier implements NotificationSender for Telegram
type TelegramNotifier struct {
	botToken string
	chatIDs  []string
	bot      *bot.Bot
}

// NewTelegramNotifier creates a new Telegram notifier
func NewTelegramNotifier(botToken string, chatIDs []string) *TelegramNotifier {
	t := &TelegramNotifier{
		botToken: botToken,
		chatIDs:  chatIDs,
	}
	t.initBot()
	return t
}

// initBot initializes the bot instance if configured
func (t *TelegramNotifier) initBot() {
	if t.botToken == "" {
		t.bot = nil
		return
	}

	b, err := bot.New(t.botToken, bot.WithSkipGetMe())
	if err != nil {
		log.Printf("[TelegramNotifier] Failed to create bot: %v", err)
		t.bot = nil
		return
	}
	t.bot = b
}

// Send sends a notification to all configured Telegram chats
func (t *TelegramNotifier) Send(ctx context.Context, content domain.NotificationContent) error {
	if !t.IsConfigured() {
		return nil // Silently skip if not configured
	}

	return t.sendMessageToAll(ctx, content.Message)
}

// SendTest sends a test notification to verify configuration
func (t *TelegramNotifier) SendTest(ctx context.Context) error {
	if !t.IsConfigured() {
		return &NotificationError{Message: "Telegram is not configured. Please provide bot token and at least one chat ID."}
	}

	testContent := domain.NewTestNotification()
	return t.sendMessageToAll(ctx, testContent.Message)
}

// IsConfigured returns true if the notifier is properly configured
func (t *TelegramNotifier) IsConfigured() bool {
	return t.botToken != "" && len(t.chatIDs) > 0 && t.bot != nil
}

// GetChannel returns the notification channel type
func (t *TelegramNotifier) GetChannel() domain.NotificationChannel {
	return domain.NotificationChannelTelegram
}

// UpdateConfig updates the notifier configuration
func (t *TelegramNotifier) UpdateConfig(botToken string, chatIDs []string) {
	t.botToken = botToken
	t.chatIDs = chatIDs
	t.initBot()
}

// sendMessageToAll sends a message to all configured chat IDs
func (t *TelegramNotifier) sendMessageToAll(ctx context.Context, text string) error {
	if t.bot == nil {
		return &NotificationError{Message: "Telegram bot not initialized"}
	}

	var lastErr error
	successCount := 0

	for _, chatID := range t.chatIDs {
		if chatID == "" {
			continue
		}

		params := &bot.SendMessageParams{
			ChatID:    chatID,
			Text:      text,
			ParseMode: models.ParseModeHTML,
		}

		_, err := t.bot.SendMessage(ctx, params)
		if err != nil {
			log.Printf("[TelegramNotifier] Failed to send message to chat %s: %v", chatID, err)
			lastErr = err
		} else {
			successCount++
			log.Printf("[TelegramNotifier] Message sent successfully to chat %s", chatID)
		}
	}

	if successCount == 0 && lastErr != nil {
		return &NotificationError{Message: "Failed to send Telegram message to any chat", Err: lastErr}
	}

	return nil
}

// NotificationError represents a notification error
type NotificationError struct {
	Message string
	Code    int
	Err     error
}

func (e *NotificationError) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}
	return e.Message
}

func (e *NotificationError) Unwrap() error {
	return e.Err
}
