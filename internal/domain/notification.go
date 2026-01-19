package domain

import "time"

// NotificationChannel represents the type of notification channel
type NotificationChannel string

const (
	NotificationChannelTelegram NotificationChannel = "telegram"
	// Future channels: discord, slack, webhook, etc.
)

// NotificationEventType represents the type of notification event
type NotificationEventType string

const (
	NotificationEventBigTrade     NotificationEventType = "big_trade"
	NotificationEventFreshWallet  NotificationEventType = "fresh_wallet"
	NotificationEventTest         NotificationEventType = "test"
)

// NotificationConfig holds configuration for notifications
type NotificationConfig struct {
	// General settings
	Enabled bool                `json:"enabled"`
	Channel NotificationChannel `json:"channel"`

	// Telegram settings
	TelegramBotToken string   `json:"telegramBotToken"`
	TelegramChatIDs  []string `json:"telegramChatIDs"`

	// Notification type toggles
	NotifyBigTrades    bool `json:"notifyBigTrades"`
	NotifyFreshWallets bool `json:"notifyFreshWallets"`
}

// DefaultNotificationConfig returns default notification configuration
func DefaultNotificationConfig() NotificationConfig {
	return NotificationConfig{
		Enabled:            false,
		Channel:            NotificationChannelTelegram,
		TelegramBotToken:   "",
		TelegramChatIDs:    []string{},
		NotifyBigTrades:    false,
		NotifyFreshWallets: false,
	}
}

// IsConfigured returns true if the notification channel is properly configured
func (c *NotificationConfig) IsConfigured() bool {
	if !c.Enabled {
		return false
	}

	switch c.Channel {
	case NotificationChannelTelegram:
		return c.TelegramBotToken != "" && len(c.TelegramChatIDs) > 0
	default:
		return false
	}
}

// NotificationContent represents the content of a notification
type NotificationContent struct {
	EventType   NotificationEventType  `json:"eventType"`
	Title       string                 `json:"title"`
	Message     string                 `json:"message"`
	Timestamp   time.Time              `json:"timestamp"`
	Priority    string                 `json:"priority"` // "high", "medium", "low"
	Metadata    map[string]string      `json:"metadata"`
}

// NewBigTradeNotification creates a notification for a big trade
func NewBigTradeNotification(event PolymarketEvent) NotificationContent {
	side := "BUY"
	if event.Side == OrderSideSell {
		side = "SELL"
	}

	sideEmoji := "🟢"
	if side == "SELL" {
		sideEmoji = "🔴"
	}

	// Calculate notional value
	var notional float64
	if event.Price != "" && event.Size != "" {
		var p, s float64
		parseFloatSimple(event.Price, &p)
		parseFloatSimple(event.Size, &s)
		notional = p * s
	}

	metadata := map[string]string{
		"market":        event.EventTitle,
		"outcome":       event.Outcome,
		"side":          side,
		"walletAddress": event.WalletAddress,
		"tradeId":       event.TradeID,
	}

	// Include wallet info if available
	betCount := ""
	joinDate := ""
	if event.WalletProfile != nil {
		betCount = formatInt(event.WalletProfile.BetCount)
		joinDate = event.WalletProfile.JoinDate
		metadata["betCount"] = betCount
		metadata["joinDate"] = joinDate
	}

	message := formatBigTradeMessage(event.EventTitle, event.Outcome, notional, side, sideEmoji, event.WalletAddress, betCount, joinDate)

	return NotificationContent{
		EventType: NotificationEventBigTrade,
		Title:     "Big Trade Alert",
		Message:   message,
		Timestamp: event.Timestamp,
		Priority:  "high",
		Metadata:  metadata,
	}
}

// NewFreshWalletNotification creates a notification for a fresh wallet detection
func NewFreshWalletNotification(profile WalletProfile) NotificationContent {
	freshnessEmoji := "🚨"
	switch profile.FreshnessLevel {
	case FreshnessInsider:
		freshnessEmoji = "🚨"
	case FreshnessWallet:
		freshnessEmoji = "🔥"
	case FreshnessNewbie:
		freshnessEmoji = "⚡"
	}

	metadata := map[string]string{
		"walletAddress":  profile.Address,
		"betCount":       formatInt(profile.BetCount),
		"joinDate":       profile.JoinDate,
		"freshnessLevel": string(profile.FreshnessLevel),
	}

	message := formatFreshWalletMessage(freshnessEmoji, profile.Address, profile.BetCount, profile.JoinDate, string(profile.FreshnessLevel))

	return NotificationContent{
		EventType: NotificationEventFreshWallet,
		Title:     "Fresh Wallet Detected",
		Message:   message,
		Timestamp: profile.AnalyzedAt,
		Priority:  "high",
		Metadata:  metadata,
	}
}

// NewTestNotification creates a test notification
func NewTestNotification() NotificationContent {
	return NotificationContent{
		EventType: NotificationEventTest,
		Title:     "Test Notification",
		Message:   "This is a test notification from XTools Polymarket Watcher. If you received this, your Telegram notifications are working correctly!",
		Timestamp: time.Now(),
		Priority:  "low",
		Metadata:  make(map[string]string),
	}
}

// Helper functions for formatting

func formatBigTradeMessage(market, outcome string, value float64, side, sideEmoji, wallet, betCount, joinDate string) string {
	msg := "<b>" + sideEmoji + " Big Trade Alert</b>\n\n"

	if market != "" {
		msg += "<b>Market:</b> " + escapeHTML(market) + "\n"
	}
	if outcome != "" {
		msg += "<b>Outcome:</b> " + escapeHTML(outcome) + "\n"
	}
	msg += "<b>Value:</b> $" + formatFloat(value, 2) + "\n"
	msg += "<b>Side:</b> " + side + "\n"
	if wallet != "" {
		msg += "<b>Wallet:</b> <code>" + escapeHTML(shortenAddr(wallet)) + "</code>\n"
	}
	if betCount != "" {
		msg += "<b>Trades:</b> " + betCount + "\n"
	}
	if joinDate != "" {
		msg += "<b>Join Date:</b> " + escapeHTML(joinDate) + "\n"
	}

	if wallet != "" {
		msg += "\n<a href=\"https://polymarket.com/profile/" + wallet + "\">View Profile</a>"
	}

	return msg
}

func formatFreshWalletMessage(emoji, wallet string, betCount int, joinDate, level string) string {
	msg := "<b>" + emoji + " Fresh Wallet Detected</b>\n\n"

	if wallet != "" {
		msg += "<b>Wallet:</b> <code>" + escapeHTML(shortenAddr(wallet)) + "</code>\n"
	}
	msg += "<b>Total Trades:</b> " + formatInt(betCount) + "\n"
	if joinDate != "" {
		msg += "<b>Join Date:</b> " + escapeHTML(joinDate) + "\n"
	}
	msg += "<b>Freshness:</b> " + escapeHTML(level) + "\n"

	if wallet != "" {
		msg += "\n<a href=\"https://polymarket.com/profile/" + wallet + "\">View Profile</a>"
	}

	return msg
}

func escapeHTML(s string) string {
	result := ""
	for _, c := range s {
		switch c {
		case '<':
			result += "&lt;"
		case '>':
			result += "&gt;"
		case '&':
			result += "&amp;"
		case '"':
			result += "&quot;"
		default:
			result += string(c)
		}
	}
	return result
}

func shortenAddr(addr string) string {
	if len(addr) <= 10 {
		return addr
	}
	return addr[:6] + "..." + addr[len(addr)-4:]
}

func formatFloat(f float64, decimals int) string {
	if decimals == 2 {
		return formatFloatStr(f, 100)
	}
	return formatFloatStr(f, 1)
}

func formatFloatStr(f float64, mult float64) string {
	// Simple float formatting without fmt package
	rounded := int64(f*mult + 0.5)
	intPart := rounded / int64(mult)
	fracPart := rounded % int64(mult)

	intStr := formatInt64(intPart)
	if mult == 1 {
		return intStr
	}

	fracStr := formatInt64(fracPart)
	if mult == 100 && fracPart < 10 {
		fracStr = "0" + fracStr
	}

	return intStr + "." + fracStr
}

func formatInt(i int) string {
	return formatInt64(int64(i))
}

func formatInt64(i int64) string {
	if i < 0 {
		return "-" + formatInt64(-i)
	}
	if i == 0 {
		return "0"
	}

	result := ""
	for i > 0 {
		result = string(rune('0'+i%10)) + result
		i /= 10
	}
	return result
}

func parseFloatSimple(str string, v *float64) {
	if str == "" {
		*v = 0
		return
	}

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
}
