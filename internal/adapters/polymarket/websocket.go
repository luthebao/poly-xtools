package polymarket

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"xtools/internal/domain"
)

const (
	// Live data WebSocket endpoint (for real-time trades)
	wsLiveDataURL = "wss://ws-live-data.polymarket.com"

	// Gamma API for fetching market metadata
	gammaAPIURL = "https://gamma-api.polymarket.com/markets"

	// Reconnect settings
	initialReconnectDelay = 1 * time.Second
	maxReconnectDelay     = 30 * time.Second
	pingInterval          = 30 * time.Second
	pingTimeout           = 60 * time.Second
)

// EventCallback is called when a new event is received
type EventCallback func(event domain.PolymarketEvent)

// WebSocketClient handles connection to Polymarket WebSocket
type WebSocketClient struct {
	mu             sync.RWMutex
	conn           *websocket.Conn
	isConnected    atomic.Bool
	isConnecting   atomic.Bool
	stopCh         chan struct{}
	eventCallback  EventCallback
	reconnectDelay time.Duration

	// Status tracking
	connectedAt      time.Time
	eventsReceived   atomic.Int64
	tradesReceived   atomic.Int64
	freshWalletsFound atomic.Int64
	lastEventAt      time.Time
	lastError        string
	reconnectCount   int
}

// NewWebSocketClient creates a new Polymarket WebSocket client
func NewWebSocketClient(callback EventCallback) *WebSocketClient {
	return &WebSocketClient{
		eventCallback:  callback,
		reconnectDelay: initialReconnectDelay,
	}
}

// Connect establishes connection to Polymarket WebSocket
// This method returns immediately and runs the connection in the background
func (c *WebSocketClient) Connect() error {
	c.mu.Lock()
	if c.isConnected.Load() || c.isConnecting.Load() {
		c.mu.Unlock()
		return nil
	}
	c.isConnecting.Store(true)
	// Always create a fresh stop channel for new connection
	c.stopCh = make(chan struct{})
	c.reconnectDelay = initialReconnectDelay
	c.mu.Unlock()

	// Run connection loop in background - don't block the caller
	go c.connectionLoop()

	return nil
}

// connectionLoop handles connection and reconnection
func (c *WebSocketClient) connectionLoop() {
	log.Println("[Polymarket] Starting connection loop")

	for {
		select {
		case <-c.stopCh:
			log.Println("[Polymarket] Connection loop stopped")
			c.isConnecting.Store(false)
			return
		default:
			log.Println("[Polymarket] Attempting to connect...")
			if err := c.connect(); err != nil {
				log.Printf("[Polymarket] Connection failed: %v", err)
				c.setError(fmt.Sprintf("connection failed: %v", err))
				c.isConnecting.Store(false)
				c.waitReconnect()
				continue
			}

			c.isConnecting.Store(false)
			log.Println("[Polymarket] Connected, starting read loop")
			c.readLoop()

			c.isConnected.Store(false)
			log.Println("[Polymarket] Read loop ended, will reconnect")

			select {
			case <-c.stopCh:
				return
			default:
				c.waitReconnect()
			}
		}
	}
}

func (c *WebSocketClient) connect() error {
	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
	}

	log.Printf("[Polymarket] Dialing %s", wsLiveDataURL)
	conn, resp, err := dialer.Dial(wsLiveDataURL, http.Header{})
	if err != nil {
		if resp != nil {
			log.Printf("[Polymarket] Dial failed with status %d: %v", resp.StatusCode, err)
		}
		return fmt.Errorf("dial failed: %w", err)
	}
	log.Println("[Polymarket] WebSocket connection established")

	c.mu.Lock()
	c.conn = conn
	c.connectedAt = time.Now()
	c.lastError = ""
	c.reconnectDelay = initialReconnectDelay
	c.mu.Unlock()

	c.isConnected.Store(true)

	// Subscribe to trade activity feed
	if err := c.subscribe(); err != nil {
		c.isConnected.Store(false)
		conn.Close()
		return fmt.Errorf("subscribe failed: %w", err)
	}

	return nil
}

func (c *WebSocketClient) subscribe() error {
	// Subscribe to activity/trades topic (all trades across all markets)
	// IMPORTANT: Must include "action": "subscribe" per Polymarket API
	subscribeMsg := map[string]any{
		"action": "subscribe",
		"subscriptions": []map[string]any{
			{
				"topic": "activity",
				"type":  "trades",
			},
		},
	}

	msgBytes, _ := json.Marshal(subscribeMsg)
	log.Printf("[Polymarket] Sending subscription: %s", string(msgBytes))

	c.mu.RLock()
	conn := c.conn
	c.mu.RUnlock()

	if conn == nil {
		return fmt.Errorf("connection is nil")
	}

	err := conn.WriteMessage(websocket.TextMessage, msgBytes)
	if err != nil {
		log.Printf("[Polymarket] Failed to send subscription: %v", err)
		return err
	}
	log.Println("[Polymarket] Subscription sent successfully")
	return nil
}

func (c *WebSocketClient) readLoop() {
	// Get stop channel reference
	c.mu.RLock()
	stopCh := c.stopCh
	c.mu.RUnlock()

	// Start ping goroutine to keep connection alive
	pingDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(pingInterval)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				c.mu.RLock()
				conn := c.conn
				c.mu.RUnlock()

				if conn == nil {
					return
				}

				if err := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(10*time.Second)); err != nil {
					log.Printf("[Polymarket] Failed to send ping: %v", err)
					return
				}
			case <-pingDone:
				return
			case <-stopCh:
				return
			}
		}
	}()

	defer close(pingDone)

	log.Println("[Polymarket] Starting to read messages...")
	messageCount := 0

	c.mu.RLock()
	conn := c.conn
	c.mu.RUnlock()

	if conn != nil {
		conn.SetPongHandler(func(appData string) error {
			return nil
		})
		conn.SetReadDeadline(time.Now().Add(pingTimeout))
	}

	for {
		// Check for stop signal
		select {
		case <-stopCh:
			log.Println("[Polymarket] Read loop received stop signal")
			return
		default:
		}

		c.mu.RLock()
		conn := c.conn
		c.mu.RUnlock()

		if conn == nil {
			return
		}

		// Reset read deadline on each message
		conn.SetReadDeadline(time.Now().Add(pingTimeout))

		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("[Polymarket] Read error: %v", err)
			c.setError(fmt.Sprintf("read error: %v", err))
			return
		}

		messageCount++
		if messageCount <= 5 {
			// Log first few messages for debugging
			if len(message) < 500 {
				log.Printf("[Polymarket] Received message #%d: %s", messageCount, string(message))
			} else {
				log.Printf("[Polymarket] Received message #%d: %s...", messageCount, string(message[:500]))
			}
		} else if messageCount%100 == 0 {
			log.Printf("[Polymarket] Received %d messages total", messageCount)
		}

		c.processMessage(message)
	}
}

func (c *WebSocketClient) processMessage(data []byte) {
	// Skip empty messages
	if len(data) == 0 {
		return
	}

	var msg map[string]any
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Printf("[Polymarket] Failed to parse message: %v", err)
		return
	}

	// Check if this is a trade message - the format is:
	// {"connection_id":"...", "payload": {...trade data...}}
	// OR for topic-based: {"topic":"activity", "type":"trades", "payload":{...}}
	payload, hasPayload := msg["payload"].(map[string]any)
	if hasPayload {
		c.processTradePayload(payload)
		return
	}

	// Log other message types for debugging
	if len(data) < 200 {
		log.Printf("[Polymarket] Unknown message format: %s", string(data))
	}
}

func (c *WebSocketClient) processTradePayload(payload map[string]any) {
	// Skip if payload is empty
	if len(payload) == 0 {
		return
	}

	event := domain.PolymarketEvent{
		EventType: domain.PolymarketEventTrade,
		Timestamp: time.Now(),
	}

	// Extract trade fields
	if v, ok := payload["transactionHash"].(string); ok {
		event.TradeID = v
	}
	if v, ok := payload["conditionId"].(string); ok {
		event.ConditionID = v
		event.AssetID = v // Use conditionId as the primary identifier
	}
	if v, ok := payload["asset"].(string); ok {
		event.AssetID = v
	}
	if v, ok := payload["proxyWallet"].(string); ok {
		event.WalletAddress = v
	}
	if v, ok := payload["side"].(string); ok {
		event.Side = domain.OrderSide(v)
	}
	if v, ok := payload["outcome"].(string); ok {
		event.Outcome = v
	}
	if v, ok := payload["outcomeIndex"].(float64); ok {
		event.OutcomeIndex = int(v)
	}
	if v, ok := payload["price"].(float64); ok {
		event.Price = fmt.Sprintf("%.6f", v)
	} else if v, ok := payload["price"].(string); ok {
		event.Price = v
	}
	if v, ok := payload["size"].(float64); ok {
		event.Size = fmt.Sprintf("%.2f", v)
	} else if v, ok := payload["size"].(string); ok {
		event.Size = v
	}
	if v, ok := payload["slug"].(string); ok {
		event.MarketSlug = v
	}
	if v, ok := payload["eventSlug"].(string); ok {
		event.EventSlug = v
	}
	if v, ok := payload["title"].(string); ok {
		event.MarketName = v
		event.EventTitle = v
	}
	if v, ok := payload["name"].(string); ok {
		event.TraderName = v
	}
	if v, ok := payload["pseudonym"].(string); ok && event.TraderName == "" {
		event.TraderName = v
	}

	// Parse timestamp
	if ts, ok := payload["timestamp"].(float64); ok {
		event.Timestamp = time.Unix(int64(ts), 0)
	}

	// Store raw data
	if rawBytes, err := json.Marshal(payload); err == nil {
		event.RawData = string(rawBytes)
	}

	// Generate market link - prefer EventSlug (event page) over MarketSlug (specific odds)
	if event.EventSlug != "" {
		event.MarketLink = fmt.Sprintf("https://polymarket.com/event/%s", event.EventSlug)
	} else if event.MarketSlug != "" {
		event.MarketLink = fmt.Sprintf("https://polymarket.com/event/%s", event.MarketSlug)
	}

	// Update counters
	c.eventsReceived.Add(1)
	c.tradesReceived.Add(1)

	c.mu.Lock()
	c.lastEventAt = time.Now()
	c.mu.Unlock()

	// Check if this looks like a significant trade (size > 100 shares)
	if event.Size != "" {
		if size, err := strconv.ParseFloat(event.Size, 64); err == nil && size >= 100 {
			log.Printf("[Polymarket] Trade: %s %s shares @ %s on %s by %s",
				event.Side, event.Size, event.Price, event.MarketSlug, shortenAddress(event.WalletAddress))
		}
	}

	if c.eventCallback != nil {
		c.eventCallback(event)
	}
}

func shortenAddress(addr string) string {
	if len(addr) <= 10 {
		return addr
	}
	return addr[:6] + "..." + addr[len(addr)-4:]
}

func (c *WebSocketClient) waitReconnect() {
	c.mu.Lock()
	delay := c.reconnectDelay
	c.reconnectDelay *= 2
	if c.reconnectDelay > maxReconnectDelay {
		c.reconnectDelay = maxReconnectDelay
	}
	c.reconnectCount++
	c.mu.Unlock()

	log.Printf("[Polymarket] Reconnecting in %v...", delay)

	select {
	case <-time.After(delay):
	case <-c.stopCh:
	}
}

func (c *WebSocketClient) setError(msg string) {
	c.mu.Lock()
	c.lastError = msg
	c.mu.Unlock()
}

// Disconnect closes the WebSocket connection
func (c *WebSocketClient) Disconnect() {
	c.mu.Lock()

	// Close stop channel to signal all goroutines to exit
	// Don't set to nil - goroutines need to be able to read from closed channel
	if c.stopCh != nil {
		select {
		case <-c.stopCh:
			// Already closed
		default:
			close(c.stopCh)
		}
	}

	// Close the connection to unblock any read operations
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}

	c.isConnected.Store(false)
	c.isConnecting.Store(false)
	c.mu.Unlock()
}

// GetStatus returns the current connection status
func (c *WebSocketClient) GetStatus() domain.PolymarketWatcherStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return domain.PolymarketWatcherStatus{
		IsRunning:         c.isConnected.Load(),
		IsConnecting:      c.isConnecting.Load(),
		ConnectedAt:       c.connectedAt,
		EventsReceived:    c.eventsReceived.Load(),
		TradesReceived:    c.tradesReceived.Load(),
		FreshWalletsFound: c.freshWalletsFound.Load(),
		LastEventAt:       c.lastEventAt,
		ErrorMessage:      c.lastError,
		ReconnectCount:    c.reconnectCount,
		WebSocketEndpoint: wsLiveDataURL,
	}
}

// IsConnected returns whether the client is currently connected
func (c *WebSocketClient) IsConnected() bool {
	return c.isConnected.Load()
}

// IncrementFreshWalletsFound increments the fresh wallets counter
func (c *WebSocketClient) IncrementFreshWalletsFound() {
	c.freshWalletsFound.Add(1)
}
