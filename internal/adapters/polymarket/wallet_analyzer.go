package polymarket

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"xtools/internal/domain"
)

const (
	// Polymarket API base URL for profile stats
	polymarketProfileAPIURL = "https://polymarket.com/api/profile/stats"

	// Cache settings
	walletCacheTTL = 5 * time.Minute
	maxCacheSize   = 10000

	// Default fresh wallet thresholds
	defaultMinTradeSize        = 100.0 // $100 USDC
	defaultFreshInsiderMaxBets = 3
	defaultFreshWalletMaxBets  = 10
	defaultFreshNewbieMaxBets  = 20

	// Confidence scoring constants
	baseConfidence      = 0.5
	insiderBonus        = 0.3 // 0-3 bets
	freshWalletBonus    = 0.2 // 0-10 bets
	newbieBonus         = 0.1 // 0-20 bets
	largeTradeBonus     = 0.1
	largeTradeThreshold = 10000.0 // $10,000
)

// ProfileStatsResponse represents the response from Polymarket profile stats API
type ProfileStatsResponse struct {
	Trades     int     `json:"trades"`
	LargestWin float64 `json:"largestWin"`
	Views      int     `json:"views"`
	JoinDate   string  `json:"joinDate"` // Format: "MMM YYYY" (e.g., "Dec 2025")
}

// WalletStore interface for wallet persistence
type WalletStore interface {
	GetWallet(address string) (*domain.WalletProfile, error)
	SaveWallet(profile domain.WalletProfile) error
}

// WalletAnalyzer analyzes wallet profiles for fresh wallet detection
type WalletAnalyzer struct {
	mu         sync.RWMutex
	httpClient *http.Client
	cache      map[string]*cachedProfile
	config     domain.PolymarketConfig
	store      WalletStore // Database store for wallet profiles
}

type cachedProfile struct {
	profile   *domain.WalletProfile
	expiresAt time.Time
}

// NewWalletAnalyzer creates a new wallet analyzer
func NewWalletAnalyzer(config domain.PolymarketConfig, store WalletStore) *WalletAnalyzer {
	return &WalletAnalyzer{
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
		cache:  make(map[string]*cachedProfile),
		config: config,
		store:  store,
	}
}

// AnalyzeWallet retrieves and analyzes a wallet's profile
// Priority: 1. Memory cache, 2. Database (if analyzed), 3. Polymarket API
func (a *WalletAnalyzer) AnalyzeWallet(ctx context.Context, address string) (*domain.WalletProfile, error) {
	if address == "" {
		return nil, fmt.Errorf("empty wallet address")
	}

	// 1. Check memory cache first (fastest)
	if profile := a.getFromCache(address); profile != nil {
		// Recalculate freshness based on current config (thresholds may have changed)
		profile.FreshnessLevel = a.determineFreshnessLevel(profile.BetCount)
		profile.IsFresh = profile.FreshnessLevel != domain.FreshnessNone
		profile.FreshThreshold = a.getMaxFreshThreshold()
		return profile, nil
	}

	// 2. Check database - only use if already analyzed (BetCount >= 0)
	if a.store != nil {
		if dbProfile, err := a.store.GetWallet(address); err == nil && dbProfile != nil && dbProfile.BetCount >= 0 {
			// Recalculate freshness based on current config thresholds
			dbProfile.FreshnessLevel = a.determineFreshnessLevel(dbProfile.BetCount)
			dbProfile.IsFresh = dbProfile.FreshnessLevel != domain.FreshnessNone
			dbProfile.FreshThreshold = a.getMaxFreshThreshold()
			dbProfile.Nonce = dbProfile.BetCount // Backward compatibility

			// Add to memory cache
			a.addToCache(address, dbProfile)

			log.Printf("[WalletAnalyzer] Loaded wallet from DB: %s trades=%d joinDate=%s fresh=%v level=%s",
				shortenAddress(address), dbProfile.BetCount, dbProfile.JoinDate, dbProfile.IsFresh, dbProfile.FreshnessLevel)
			return dbProfile, nil
		}
	}

	// 3. Fetch from Polymarket Profile API
	stats, err := a.getProfileStats(ctx, address)
	if err != nil {
		log.Printf("[WalletAnalyzer] Failed to get profile stats for %s: %v", shortenAddress(address), err)
		// Return a default profile with unknown data
		return &domain.WalletProfile{
			Address:        address,
			BetCount:       -1,
			IsFresh:        false,
			AnalyzedAt:     time.Now(),
			FreshThreshold: a.getMaxFreshThreshold(),
		}, nil
	}

	// Determine freshness level based on current config
	freshnessLevel := a.determineFreshnessLevel(stats.Trades)
	isFresh := freshnessLevel != domain.FreshnessNone

	profile := &domain.WalletProfile{
		Address:        address,
		BetCount:       stats.Trades,
		JoinDate:       stats.JoinDate,
		FreshnessLevel: freshnessLevel,
		IsFresh:        isFresh,
		AnalyzedAt:     time.Now(),
		FreshThreshold: a.getMaxFreshThreshold(),
		// Backward compatibility
		Nonce:        stats.Trades,
		TotalTxCount: stats.Trades,
		IsBrandNew:   stats.Trades == 0,
	}

	// Save to database for future lookups
	if a.store != nil {
		if err := a.store.SaveWallet(*profile); err != nil {
			log.Printf("[WalletAnalyzer] Failed to save wallet to DB: %v", err)
		} else {
			log.Printf("[WalletAnalyzer] Saved wallet to DB: %s trades=%d joinDate=%s fresh=%v",
				shortenAddress(address), stats.Trades, stats.JoinDate, isFresh)
		}
	}

	// Add to memory cache
	a.addToCache(address, profile)

	return profile, nil
}

// AnalyzeTrade analyzes a trade event for fresh wallet signals
func (a *WalletAnalyzer) AnalyzeTrade(ctx context.Context, event *domain.PolymarketEvent) (*domain.FreshWalletSignal, error) {
	if event.WalletAddress == "" {
		return nil, nil
	}

	// Check minimum trade size
	tradeSize := a.parseTradeSize(event)
	if tradeSize < a.getMinTradeSize() {
		return nil, nil
	}

	// Analyze wallet
	profile, err := a.AnalyzeWallet(ctx, event.WalletAddress)
	if err != nil {
		return nil, err
	}

	// Check if wallet is fresh
	if !profile.IsFresh {
		return nil, nil
	}

	// Calculate confidence score
	confidence, factors := a.calculateConfidence(profile, tradeSize)

	signal := &domain.FreshWalletSignal{
		Confidence: confidence,
		Factors:    factors,
		Triggered:  true,
	}

	// Update event with wallet info
	event.WalletProfile = profile
	event.IsFreshWallet = true
	event.FreshWalletSignal = signal
	event.RiskScore = confidence

	// Add risk signals
	event.RiskSignals = a.generateRiskSignals(profile, tradeSize)

	log.Printf("[WalletAnalyzer] Fresh wallet detected: %s bets=%d level=%s confidence=%.2f trade=$%.2f",
		shortenAddress(event.WalletAddress), profile.BetCount, profile.FreshnessLevel, confidence, tradeSize)

	return signal, nil
}

// getProfileStats fetches wallet profile stats from Polymarket profile API
func (a *WalletAnalyzer) getProfileStats(ctx context.Context, address string) (*ProfileStatsResponse, error) {
	url := fmt.Sprintf("%s?proxyAddress=%s", polymarketProfileAPIURL, address)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")

	resp, err := a.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch profile stats: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	var stats ProfileStatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &stats, nil
}

// getBetCount fetches the total trade count for a wallet from Polymarket profile API
func (a *WalletAnalyzer) getBetCount(ctx context.Context, address string) (int, error) {
	stats, err := a.getProfileStats(ctx, address)
	if err != nil {
		return 0, err
	}
	return stats.Trades, nil
}

// determineFreshnessLevel categorizes the wallet based on bet count
func (a *WalletAnalyzer) determineFreshnessLevel(betCount int) domain.FreshnessLevel {
	if betCount < 0 {
		return domain.FreshnessNone
	}

	insiderMax := a.getFreshInsiderMaxBets()
	walletMax := a.getFreshWalletMaxBets()
	newbieMax := a.getFreshNewbieMaxBets()
	customMax := a.getCustomFreshMaxBets()

	// Check custom threshold first if configured
	if customMax > 0 && betCount <= customMax {
		// Still categorize by the standard levels for more specific info
		if betCount <= insiderMax {
			return domain.FreshnessInsider
		}
		if betCount <= walletMax {
			return domain.FreshnessWallet
		}
		if betCount <= newbieMax {
			return domain.FreshnessNewbie
		}
		return domain.FreshnessCustom
	}

	// Standard thresholds
	if betCount <= insiderMax {
		return domain.FreshnessInsider
	}
	if betCount <= walletMax {
		return domain.FreshnessWallet
	}
	if betCount <= newbieMax {
		return domain.FreshnessNewbie
	}

	return domain.FreshnessNone
}

func (a *WalletAnalyzer) calculateConfidence(profile *domain.WalletProfile, tradeSize float64) (float64, map[string]float64) {
	factors := make(map[string]float64)
	confidence := baseConfidence
	factors["base"] = baseConfidence

	// Add bonus based on freshness level
	switch profile.FreshnessLevel {
	case domain.FreshnessInsider:
		factors["insider_wallet"] = insiderBonus
		confidence += insiderBonus
	case domain.FreshnessWallet:
		factors["fresh_wallet"] = freshWalletBonus
		confidence += freshWalletBonus
	case domain.FreshnessNewbie:
		factors["newbie_wallet"] = newbieBonus
		confidence += newbieBonus
	case domain.FreshnessCustom:
		factors["custom_fresh"] = newbieBonus
		confidence += newbieBonus
	}

	// Zero bet bonus (brand new)
	if profile.BetCount == 0 {
		factors["zero_bets"] = 0.1
		confidence += 0.1
	}

	// Large trade bonus
	if tradeSize > largeTradeThreshold {
		factors["large_trade"] = largeTradeBonus
		confidence += largeTradeBonus
	}

	// Clamp confidence to [0, 1]
	if confidence > 1.0 {
		confidence = 1.0
	}
	if confidence < 0 {
		confidence = 0
	}

	return confidence, factors
}

func (a *WalletAnalyzer) generateRiskSignals(profile *domain.WalletProfile, tradeSize float64) []string {
	var signals []string

	switch profile.FreshnessLevel {
	case domain.FreshnessInsider:
		if profile.BetCount == 0 {
			signals = append(signals, "🚨 Fresh Insider (0 bets)")
		} else {
			signals = append(signals, fmt.Sprintf("🚨 Fresh Insider (%d bets)", profile.BetCount))
		}
	case domain.FreshnessWallet:
		signals = append(signals, fmt.Sprintf("🔥 Fresh Wallet (%d bets)", profile.BetCount))
	case domain.FreshnessNewbie:
		signals = append(signals, fmt.Sprintf("⚡ Fresh Newbie (%d bets)", profile.BetCount))
	case domain.FreshnessCustom:
		signals = append(signals, fmt.Sprintf("✨ Fresher (%d bets)", profile.BetCount))
	}

	if tradeSize >= largeTradeThreshold {
		signals = append(signals, fmt.Sprintf("💰 Large Position ($%.2f)", tradeSize))
	}

	return signals
}

func (a *WalletAnalyzer) parseTradeSize(event *domain.PolymarketEvent) float64 {
	if event.Size == "" || event.Price == "" {
		return 0
	}

	size, err := strconv.ParseFloat(event.Size, 64)
	if err != nil {
		return 0
	}

	price, err := strconv.ParseFloat(event.Price, 64)
	if err != nil {
		return 0
	}

	// Notional value = size * price
	return size * price
}

func (a *WalletAnalyzer) getFromCache(address string) *domain.WalletProfile {
	a.mu.RLock()
	defer a.mu.RUnlock()

	cached, ok := a.cache[address]
	if !ok {
		return nil
	}

	if time.Now().After(cached.expiresAt) {
		return nil
	}

	return cached.profile
}

func (a *WalletAnalyzer) addToCache(address string, profile *domain.WalletProfile) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Evict old entries if cache is too large
	if len(a.cache) >= maxCacheSize {
		// Remove expired entries
		now := time.Now()
		for k, v := range a.cache {
			if now.After(v.expiresAt) {
				delete(a.cache, k)
			}
		}
		// If still too large, clear half
		if len(a.cache) >= maxCacheSize {
			count := 0
			for k := range a.cache {
				delete(a.cache, k)
				count++
				if count >= maxCacheSize/2 {
					break
				}
			}
		}
	}

	a.cache[address] = &cachedProfile{
		profile:   profile,
		expiresAt: time.Now().Add(walletCacheTTL),
	}
}

func (a *WalletAnalyzer) getFreshInsiderMaxBets() int {
	if a.config.FreshInsiderMaxBets > 0 {
		return a.config.FreshInsiderMaxBets
	}
	return defaultFreshInsiderMaxBets
}

func (a *WalletAnalyzer) getFreshWalletMaxBets() int {
	if a.config.FreshWalletMaxBets > 0 {
		return a.config.FreshWalletMaxBets
	}
	return defaultFreshWalletMaxBets
}

func (a *WalletAnalyzer) getFreshNewbieMaxBets() int {
	if a.config.FreshNewbieMaxBets > 0 {
		return a.config.FreshNewbieMaxBets
	}
	return defaultFreshNewbieMaxBets
}

func (a *WalletAnalyzer) getCustomFreshMaxBets() int {
	return a.config.CustomFreshMaxBets
}

func (a *WalletAnalyzer) getMaxFreshThreshold() int {
	// Return the maximum threshold being used
	custom := a.getCustomFreshMaxBets()
	if custom > 0 {
		return custom
	}
	return a.getFreshNewbieMaxBets()
}

func (a *WalletAnalyzer) getMinTradeSize() float64 {
	if a.config.MinTradeSize > 0 {
		return a.config.MinTradeSize
	}
	return defaultMinTradeSize
}

// FetchAndUpdateWallet always fetches fresh data from API and updates the database
// This is used by the background refresh worker to keep wallet data up-to-date
func (a *WalletAnalyzer) FetchAndUpdateWallet(ctx context.Context, address string) (*domain.WalletProfile, error) {
	if address == "" {
		return nil, fmt.Errorf("empty wallet address")
	}

	// Always fetch from Polymarket Profile API (bypass cache and DB)
	stats, err := a.getProfileStats(ctx, address)
	if err != nil {
		log.Printf("[WalletAnalyzer] Failed to fetch profile stats for %s: %v", shortenAddress(address), err)
		return nil, err
	}

	// Determine freshness level based on current config
	freshnessLevel := a.determineFreshnessLevel(stats.Trades)
	isFresh := freshnessLevel != domain.FreshnessNone

	profile := &domain.WalletProfile{
		Address:        address,
		BetCount:       stats.Trades,
		JoinDate:       stats.JoinDate,
		FreshnessLevel: freshnessLevel,
		IsFresh:        isFresh,
		AnalyzedAt:     time.Now(),
		FreshThreshold: a.getMaxFreshThreshold(),
		// Backward compatibility
		Nonce:        stats.Trades,
		TotalTxCount: stats.Trades,
		IsBrandNew:   stats.Trades == 0,
	}

	// Save to database
	if a.store != nil {
		if err := a.store.SaveWallet(*profile); err != nil {
			log.Printf("[WalletAnalyzer] Failed to save wallet to DB: %v", err)
		} else {
			log.Printf("[WalletAnalyzer] Updated wallet: %s trades=%d joinDate=%s fresh=%v",
				shortenAddress(address), stats.Trades, stats.JoinDate, isFresh)
		}
	}

	// Update memory cache
	a.addToCache(address, profile)

	return profile, nil
}
