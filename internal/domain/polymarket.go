package domain

import "time"

// PolymarketEventType represents the type of Polymarket event
type PolymarketEventType string

const (
	PolymarketEventTrade         PolymarketEventType = "trade"
	PolymarketEventBook          PolymarketEventType = "book"
	PolymarketEventPriceChange   PolymarketEventType = "price_change"
	PolymarketEventLastTradePrice PolymarketEventType = "last_trade_price"
	PolymarketEventTickSizeChange PolymarketEventType = "tick_size_change"
)

// OrderSide represents buy or sell
type OrderSide string

const (
	OrderSideBuy  OrderSide = "BUY"
	OrderSideSell OrderSide = "SELL"
)

// FreshnessLevel represents the freshness category of a wallet based on bet count
type FreshnessLevel string

const (
	FreshnessNone       FreshnessLevel = ""            // Not fresh (exceeds all thresholds)
	FreshnessInsider    FreshnessLevel = "insider"     // 0-3 bets: likely insider
	FreshnessWallet     FreshnessLevel = "fresh"       // 0-10 bets: fresh wallet
	FreshnessNewbie     FreshnessLevel = "newbie"      // 0-20 bets: new user
	FreshnessCustom     FreshnessLevel = "fresher"     // Custom threshold
)

// PolymarketEvent represents a generic event from Polymarket WebSocket
type PolymarketEvent struct {
	ID          int64               `json:"id"`
	EventType   PolymarketEventType `json:"eventType"`
	AssetID     string              `json:"assetId"`
	MarketSlug  string              `json:"marketSlug"`
	MarketName  string              `json:"marketName"`
	MarketImage string              `json:"marketImage"`
	MarketLink  string              `json:"marketLink"`
	Timestamp   time.Time           `json:"timestamp"`
	RawData     string              `json:"rawData"`

	// Price change specific fields
	Price    string    `json:"price,omitempty"`
	Size     string    `json:"size,omitempty"`
	Side     OrderSide `json:"side,omitempty"`
	BestBid  string    `json:"bestBid,omitempty"`
	BestAsk  string    `json:"bestAsk,omitempty"`

	// Last trade specific fields
	FeeRateBps int `json:"feeRateBps,omitempty"`

	// Trade-specific fields (from live data feed)
	TradeID       string `json:"tradeId,omitempty"`
	WalletAddress string `json:"walletAddress,omitempty"`
	Outcome       string `json:"outcome,omitempty"`
	OutcomeIndex  int    `json:"outcomeIndex,omitempty"`
	EventSlug     string `json:"eventSlug,omitempty"`
	EventTitle    string `json:"eventTitle,omitempty"`
	TraderName    string `json:"traderName,omitempty"`
	ConditionID   string `json:"conditionId,omitempty"`

	// Fresh wallet detection fields
	IsFreshWallet      bool             `json:"isFreshWallet,omitempty"`
	WalletProfile      *WalletProfile   `json:"walletProfile,omitempty"`
	RiskSignals        []string         `json:"riskSignals,omitempty"`
	RiskScore          float64          `json:"riskScore,omitempty"`
	FreshWalletSignal  *FreshWalletSignal `json:"freshWalletSignal,omitempty"`
}

// WalletProfile contains analyzed wallet information
type WalletProfile struct {
	Address        string         `json:"address"`
	BetCount       int            `json:"betCount"`          // Total number of trades/bets on Polymarket
	JoinDate       string         `json:"joinDate"`          // When the wallet joined Polymarket (e.g., "Dec 2025")
	FreshnessLevel FreshnessLevel `json:"freshnessLevel"`    // Categorized freshness level
	IsFresh        bool           `json:"isFresh"`
	AnalyzedAt     time.Time      `json:"analyzedAt"`
	FreshThreshold int            `json:"freshThreshold"`    // Custom threshold used for detection

	// Deprecated: kept for backward compatibility, use BetCount instead
	Nonce        int  `json:"nonce,omitempty"`
	TotalTxCount int  `json:"totalTxCount,omitempty"`
	IsBrandNew   bool `json:"isBrandNew,omitempty"`

	// Optional fields (not currently used)
	FirstSeen    time.Time `json:"firstSeen,omitempty"`
	AgeHours     float64   `json:"ageHours,omitempty"`
	BalanceMatic string    `json:"balanceMatic,omitempty"`
	BalanceUSDC  string    `json:"balanceUsdc,omitempty"`
}

// FreshWalletSignal represents a detected fresh wallet trade
type FreshWalletSignal struct {
	Confidence float64            `json:"confidence"`
	Factors    map[string]float64 `json:"factors"`
	Triggered  bool               `json:"triggered"`
}

// SizeAnomalySignal represents unusual trade size detection
type SizeAnomalySignal struct {
	VolumeImpact  float64            `json:"volumeImpact"`
	BookImpact    float64            `json:"bookImpact"`
	IsNicheMarket bool               `json:"isNicheMarket"`
	Confidence    float64            `json:"confidence"`
	Factors       map[string]float64 `json:"factors"`
	Triggered     bool               `json:"triggered"`
}

// RiskAssessment combines multiple signals
type RiskAssessment struct {
	SignalsTriggered  int                `json:"signalsTriggered"`
	WeightedScore     float64            `json:"weightedScore"`
	ShouldAlert       bool               `json:"shouldAlert"`
	FreshWalletSignal *FreshWalletSignal `json:"freshWalletSignal,omitempty"`
	SizeAnomalySignal *SizeAnomalySignal `json:"sizeAnomalySignal,omitempty"`
	AssessmentID      string             `json:"assessmentId"`
	Timestamp         time.Time          `json:"timestamp"`
}

// PolymarketEventFilter represents filter criteria for events
type PolymarketEventFilter struct {
	EventTypes       []PolymarketEventType `json:"eventTypes,omitempty"`
	MarketName       string                `json:"marketName,omitempty"`
	MinPrice         float64               `json:"minPrice,omitempty"`
	MaxPrice         float64               `json:"maxPrice,omitempty"`
	Side             OrderSide             `json:"side,omitempty"`
	MinSize          float64               `json:"minSize,omitempty"`
	Limit            int                   `json:"limit,omitempty"`
	Offset           int                   `json:"offset,omitempty"`
	FreshWalletsOnly bool                  `json:"freshWalletsOnly,omitempty"`
	MinRiskScore     float64               `json:"minRiskScore,omitempty"`
	MaxWalletNonce   int                   `json:"maxWalletNonce,omitempty"`
}

// PolymarketWatcherStatus represents the current status of the watcher
type PolymarketWatcherStatus struct {
	IsRunning           bool      `json:"isRunning"`
	IsConnecting        bool      `json:"isConnecting"`
	ConnectedAt         time.Time `json:"connectedAt,omitempty"`
	EventsReceived      int64     `json:"eventsReceived"`
	TradesReceived      int64     `json:"tradesReceived"`
	FreshWalletsFound   int64     `json:"freshWalletsFound"`
	LastEventAt         time.Time `json:"lastEventAt,omitempty"`
	ErrorMessage        string    `json:"errorMessage,omitempty"`
	ReconnectCount      int       `json:"reconnectCount"`
	WebSocketEndpoint   string    `json:"webSocketEndpoint"`
}

// DatabaseInfo represents database statistics
type DatabaseInfo struct {
	SizeBytes     int64  `json:"sizeBytes"`
	SizeFormatted string `json:"sizeFormatted"`
	EventCount    int64  `json:"eventCount"`
	Path          string `json:"path"`
}

// PolymarketConfig holds configuration for the Polymarket watcher
type PolymarketConfig struct {
	Enabled        bool    `json:"enabled"`
	MinTradeSize   float64 `json:"minTradeSize"`   // Min trade size in USDC to analyze
	AlertThreshold float64 `json:"alertThreshold"` // Risk score threshold for alerts

	// Fresh wallet detection thresholds (bet count based)
	FreshInsiderMaxBets int `json:"freshInsiderMaxBets"` // Max bets to be "insider" (default: 3)
	FreshWalletMaxBets  int `json:"freshWalletMaxBets"`  // Max bets to be "fresh" (default: 10)
	FreshNewbieMaxBets  int `json:"freshNewbieMaxBets"`  // Max bets to be "newbie" (default: 20)
	CustomFreshMaxBets  int `json:"customFreshMaxBets"`  // Custom threshold for "fresher" (0 = disabled)

	// Deprecated: RPC-based detection is no longer used
	PolygonRPCURL       string   `json:"polygonRpcUrl,omitempty"`
	PolygonRPCURLs      []string `json:"polygonRpcUrls,omitempty"`
	FreshWalletMaxNonce int      `json:"freshWalletMaxNonce,omitempty"`
	FreshWalletMaxAge   float64  `json:"freshWalletMaxAge,omitempty"`
}

// DefaultPolymarketConfig returns default configuration
func DefaultPolymarketConfig() PolymarketConfig {
	return PolymarketConfig{
		Enabled:             true,
		MinTradeSize:        100, // $100 minimum for fresh wallet analysis
		AlertThreshold:      0.7,
		FreshInsiderMaxBets: 3,
		FreshWalletMaxBets:  10,
		FreshNewbieMaxBets:  20,
		CustomFreshMaxBets:  0, // Disabled by default
	}
}
