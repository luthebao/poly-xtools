package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"xtools/internal/domain"
)

// PolymarketStore handles storage for Polymarket events
type PolymarketStore struct {
	db     *sql.DB
	dbPath string
}

// NewPolymarketStore creates a new Polymarket store
func NewPolymarketStore(dbPath string) (*PolymarketStore, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &PolymarketStore{db: db, dbPath: dbPath}
	if err := store.migrate(); err != nil {
		db.Close()
		return nil, err
	}

	return store, nil
}

func (s *PolymarketStore) migrate() error {
	migrations := []string{
		// Original table
		`CREATE TABLE IF NOT EXISTS polymarket_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_type TEXT NOT NULL,
			asset_id TEXT,
			market_slug TEXT,
			market_name TEXT,
			market_image TEXT,
			market_link TEXT,
			timestamp DATETIME NOT NULL,
			raw_data TEXT,
			price TEXT,
			size TEXT,
			side TEXT,
			best_bid TEXT,
			best_ask TEXT,
			fee_rate_bps INTEGER
		)`,
		`CREATE INDEX IF NOT EXISTS idx_polymarket_timestamp ON polymarket_events(timestamp DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_polymarket_event_type ON polymarket_events(event_type)`,
		`CREATE INDEX IF NOT EXISTS idx_polymarket_market_name ON polymarket_events(market_name)`,
	}

	// Add new columns for trade data (ignore errors if columns already exist)
	newColumns := []string{
		`ALTER TABLE polymarket_events ADD COLUMN trade_id TEXT`,
		`ALTER TABLE polymarket_events ADD COLUMN wallet_address TEXT`,
		`ALTER TABLE polymarket_events ADD COLUMN outcome TEXT`,
		`ALTER TABLE polymarket_events ADD COLUMN outcome_index INTEGER`,
		`ALTER TABLE polymarket_events ADD COLUMN event_slug TEXT`,
		`ALTER TABLE polymarket_events ADD COLUMN event_title TEXT`,
		`ALTER TABLE polymarket_events ADD COLUMN trader_name TEXT`,
		`ALTER TABLE polymarket_events ADD COLUMN condition_id TEXT`,
		`ALTER TABLE polymarket_events ADD COLUMN is_fresh_wallet INTEGER DEFAULT 0`,
		`ALTER TABLE polymarket_events ADD COLUMN wallet_nonce INTEGER`,
		`ALTER TABLE polymarket_events ADD COLUMN risk_score REAL DEFAULT 0`,
		`ALTER TABLE polymarket_events ADD COLUMN risk_signals TEXT`,
		`ALTER TABLE polymarket_events ADD COLUMN fresh_wallet_signal TEXT`,
	}

	// New indexes for fresh wallet queries
	newIndexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_polymarket_fresh_wallet ON polymarket_events(is_fresh_wallet) WHERE is_fresh_wallet = 1`,
		`CREATE INDEX IF NOT EXISTS idx_polymarket_wallet_address ON polymarket_events(wallet_address)`,
		`CREATE INDEX IF NOT EXISTS idx_polymarket_risk_score ON polymarket_events(risk_score DESC)`,
	}

	// Settings table for storing config and filter settings
	settingsTable := `CREATE TABLE IF NOT EXISTS polymarket_settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`

	// Wallets table for caching wallet profiles
	walletsTable := `CREATE TABLE IF NOT EXISTS polymarket_wallets (
		address TEXT PRIMARY KEY,
		bet_count INTEGER NOT NULL DEFAULT -1,
		join_date TEXT,
		freshness_level TEXT,
		is_fresh INTEGER DEFAULT 0,
		first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_analyzed_at DATETIME,
		total_trades INTEGER DEFAULT 0,
		total_volume REAL DEFAULT 0
	)`

	walletsIndexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_wallets_bet_count ON polymarket_wallets(bet_count)`,
		`CREATE INDEX IF NOT EXISTS idx_wallets_is_fresh ON polymarket_wallets(is_fresh) WHERE is_fresh = 1`,
		`CREATE INDEX IF NOT EXISTS idx_wallets_last_analyzed ON polymarket_wallets(last_analyzed_at)`,
		`CREATE INDEX IF NOT EXISTS idx_wallets_unanalyzed ON polymarket_wallets(bet_count) WHERE bet_count = -1`,
	}

	// Add join_date column if it doesn't exist (migration)
	walletMigrations := []string{
		`ALTER TABLE polymarket_wallets ADD COLUMN join_date TEXT`,
	}

	for _, m := range migrations {
		if _, err := s.db.Exec(m); err != nil {
			return fmt.Errorf("migration failed: %w", err)
		}
	}

	// Create settings table
	if _, err := s.db.Exec(settingsTable); err != nil {
		return fmt.Errorf("failed to create settings table: %w", err)
	}

	// Create wallets table
	if _, err := s.db.Exec(walletsTable); err != nil {
		return fmt.Errorf("failed to create wallets table: %w", err)
	}

	// Add new columns (ignore "duplicate column" errors)
	for _, col := range newColumns {
		s.db.Exec(col) // Ignore errors for existing columns
	}

	// Add new indexes
	for _, idx := range newIndexes {
		s.db.Exec(idx) // Ignore errors if index exists
	}

	// Add wallet indexes
	for _, idx := range walletsIndexes {
		s.db.Exec(idx)
	}

	// Run wallet table migrations (ignore errors for existing columns)
	for _, mig := range walletMigrations {
		s.db.Exec(mig)
	}

	// Notified items table for tracking sent notifications
	notifiedItemsTable := `CREATE TABLE IF NOT EXISTS notified_items (
		item_type TEXT NOT NULL,
		item_id TEXT NOT NULL,
		notified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (item_type, item_id)
	)`
	if _, err := s.db.Exec(notifiedItemsTable); err != nil {
		return fmt.Errorf("failed to create notified_items table: %w", err)
	}

	return nil
}

// SaveEvent saves a Polymarket event to the database
func (s *PolymarketStore) SaveEvent(event domain.PolymarketEvent) error {
	// Serialize risk signals and fresh wallet signal
	var riskSignalsJSON, freshWalletSignalJSON string
	if len(event.RiskSignals) > 0 {
		if data, err := json.Marshal(event.RiskSignals); err == nil {
			riskSignalsJSON = string(data)
		}
	}
	if event.FreshWalletSignal != nil {
		if data, err := json.Marshal(event.FreshWalletSignal); err == nil {
			freshWalletSignalJSON = string(data)
		}
	}

	var walletNonce *int
	if event.WalletProfile != nil {
		// Store betCount (use BetCount if available, fall back to Nonce for backward compatibility)
		if event.WalletProfile.BetCount > 0 {
			walletNonce = &event.WalletProfile.BetCount
		} else {
			walletNonce = &event.WalletProfile.Nonce
		}
	}

	_, err := s.db.Exec(`
		INSERT INTO polymarket_events (
			event_type, asset_id, market_slug, market_name, market_image, market_link,
			timestamp, raw_data, price, size, side, best_bid, best_ask, fee_rate_bps,
			trade_id, wallet_address, outcome, outcome_index, event_slug, event_title,
			trader_name, condition_id, is_fresh_wallet, wallet_nonce, risk_score,
			risk_signals, fresh_wallet_signal
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		event.EventType, event.AssetID, event.MarketSlug, event.MarketName,
		event.MarketImage, event.MarketLink, event.Timestamp, event.RawData,
		event.Price, event.Size, event.Side, event.BestBid, event.BestAsk, event.FeeRateBps,
		event.TradeID, event.WalletAddress, event.Outcome, event.OutcomeIndex,
		event.EventSlug, event.EventTitle, event.TraderName, event.ConditionID,
		event.IsFreshWallet, walletNonce, event.RiskScore,
		riskSignalsJSON, freshWalletSignalJSON,
	)
	return err
}

// GetEvents retrieves events with optional filtering
func (s *PolymarketStore) GetEvents(filter domain.PolymarketEventFilter) ([]domain.PolymarketEvent, error) {
	var conditions []string
	var args []any

	if len(filter.EventTypes) > 0 {
		placeholders := make([]string, len(filter.EventTypes))
		for i, et := range filter.EventTypes {
			placeholders[i] = "?"
			args = append(args, et)
		}
		conditions = append(conditions, fmt.Sprintf("event_type IN (%s)", strings.Join(placeholders, ",")))
	}

	if filter.MarketName != "" {
		conditions = append(conditions, "(market_name LIKE ? OR event_title LIKE ?)")
		args = append(args, "%"+filter.MarketName+"%", "%"+filter.MarketName+"%")
	}

	if filter.MinPrice > 0 {
		conditions = append(conditions, "CAST(price AS REAL) >= ?")
		args = append(args, filter.MinPrice)
	}

	if filter.MaxPrice > 0 {
		conditions = append(conditions, "CAST(price AS REAL) <= ?")
		args = append(args, filter.MaxPrice)
	}

	if filter.Side != "" {
		conditions = append(conditions, "side = ?")
		args = append(args, filter.Side)
	}

	if filter.MinSize > 0 {
		// Filter by notional value (price * size) instead of just size
		conditions = append(conditions, "(CAST(price AS REAL) * CAST(size AS REAL)) >= ?")
		args = append(args, filter.MinSize)
	}

	if filter.FreshWalletsOnly {
		conditions = append(conditions, "is_fresh_wallet = 1")
	}

	if filter.MinRiskScore > 0 {
		conditions = append(conditions, "risk_score >= ?")
		args = append(args, filter.MinRiskScore)
	}

	if filter.MaxWalletNonce > 0 {
		conditions = append(conditions, "wallet_nonce IS NOT NULL AND wallet_nonce <= ?")
		args = append(args, filter.MaxWalletNonce)
	}

	query := `SELECT id, event_type, asset_id, market_slug, market_name, market_image, market_link,
		timestamp, raw_data, price, size, side, best_bid, best_ask, fee_rate_bps,
		trade_id, wallet_address, outcome, outcome_index, event_slug, event_title,
		trader_name, condition_id, is_fresh_wallet, wallet_nonce, risk_score,
		risk_signals, fresh_wallet_signal
		FROM polymarket_events`

	if len(conditions) > 0 {
		query += " WHERE " + strings.Join(conditions, " AND ")
	}

	query += " ORDER BY timestamp DESC"

	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	query += fmt.Sprintf(" LIMIT %d", limit)

	if filter.Offset > 0 {
		query += fmt.Sprintf(" OFFSET %d", filter.Offset)
	}

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []domain.PolymarketEvent
	for rows.Next() {
		var e domain.PolymarketEvent
		var assetID, marketSlug, marketName, marketImage, marketLink sql.NullString
		var rawData, price, size, side, bestBid, bestAsk sql.NullString
		var feeRateBps sql.NullInt64
		var tradeID, walletAddress, outcome, eventSlug, eventTitle, traderName, conditionID sql.NullString
		var outcomeIndex sql.NullInt64
		var isFreshWallet sql.NullBool
		var walletNonce sql.NullInt64
		var riskScore sql.NullFloat64
		var riskSignals, freshWalletSignal sql.NullString

		if err := rows.Scan(
			&e.ID, &e.EventType, &assetID, &marketSlug, &marketName,
			&marketImage, &marketLink, &e.Timestamp, &rawData,
			&price, &size, &side, &bestBid, &bestAsk, &feeRateBps,
			&tradeID, &walletAddress, &outcome, &outcomeIndex, &eventSlug, &eventTitle,
			&traderName, &conditionID, &isFreshWallet, &walletNonce, &riskScore,
			&riskSignals, &freshWalletSignal,
		); err != nil {
			continue
		}

		e.AssetID = assetID.String
		e.MarketSlug = marketSlug.String
		e.MarketName = marketName.String
		e.MarketImage = marketImage.String
		e.MarketLink = marketLink.String
		e.RawData = rawData.String
		e.Price = price.String
		e.Size = size.String
		e.Side = domain.OrderSide(side.String)
		e.BestBid = bestBid.String
		e.BestAsk = bestAsk.String
		e.FeeRateBps = int(feeRateBps.Int64)
		e.TradeID = tradeID.String
		e.WalletAddress = walletAddress.String
		e.Outcome = outcome.String
		e.OutcomeIndex = int(outcomeIndex.Int64)
		e.EventSlug = eventSlug.String
		e.EventTitle = eventTitle.String
		e.TraderName = traderName.String
		e.ConditionID = conditionID.String
		e.IsFreshWallet = isFreshWallet.Bool
		e.RiskScore = riskScore.Float64

		// Parse risk signals
		if riskSignals.String != "" {
			json.Unmarshal([]byte(riskSignals.String), &e.RiskSignals)
		}

		// Parse fresh wallet signal
		if freshWalletSignal.String != "" {
			var signal domain.FreshWalletSignal
			if json.Unmarshal([]byte(freshWalletSignal.String), &signal) == nil {
				e.FreshWalletSignal = &signal
			}
		}

		// Reconstruct wallet profile if we have data
		if walletNonce.Valid {
			e.WalletProfile = &domain.WalletProfile{
				Address:  walletAddress.String,
				BetCount: int(walletNonce.Int64),
				Nonce:    int(walletNonce.Int64), // Backward compatibility
				IsFresh:  isFreshWallet.Bool,
			}
		}

		events = append(events, e)
	}

	return events, nil
}

// GetEventCount returns the total count of events
func (s *PolymarketStore) GetEventCount() (int64, error) {
	var count int64
	err := s.db.QueryRow("SELECT COUNT(*) FROM polymarket_events").Scan(&count)
	return count, err
}

// GetFreshWalletCount returns count of fresh wallet events
func (s *PolymarketStore) GetFreshWalletCount() (int64, error) {
	var count int64
	err := s.db.QueryRow("SELECT COUNT(*) FROM polymarket_events WHERE is_fresh_wallet = 1").Scan(&count)
	return count, err
}

// ClearEvents removes all Polymarket events and wallets
func (s *PolymarketStore) ClearEvents() error {
	// Clear events
	if _, err := s.db.Exec("DELETE FROM polymarket_events"); err != nil {
		return err
	}
	// Clear wallets
	if _, err := s.db.Exec("DELETE FROM polymarket_wallets"); err != nil {
		return err
	}
	// Vacuum to reclaim space
	_, err := s.db.Exec("VACUUM")
	return err
}

// GetDatabaseInfo returns database statistics
func (s *PolymarketStore) GetDatabaseInfo() (*domain.DatabaseInfo, error) {
	info := &domain.DatabaseInfo{
		Path: s.dbPath,
	}

	// Get file size
	if stat, err := os.Stat(s.dbPath); err == nil {
		info.SizeBytes = stat.Size()
		info.SizeFormatted = formatBytes(stat.Size())
	}

	// Get event count
	count, err := s.GetEventCount()
	if err != nil {
		return info, err
	}
	info.EventCount = count

	return info, nil
}

// Close closes the database connection
func (s *PolymarketStore) Close() error {
	return s.db.Close()
}

// formatBytes converts bytes to human readable format
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return strconv.FormatInt(bytes, 10) + " B"
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// SaveSetting saves a setting to the database
func (s *PolymarketStore) SaveSetting(key string, value any) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("failed to marshal setting: %w", err)
	}

	_, err = s.db.Exec(`
		INSERT INTO polymarket_settings (key, value, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
		key, string(data), string(data))
	return err
}

// LoadSetting loads a setting from the database
func (s *PolymarketStore) LoadSetting(key string, dest any) error {
	var value string
	err := s.db.QueryRow("SELECT value FROM polymarket_settings WHERE key = ?", key).Scan(&value)
	if err != nil {
		return err
	}
	return json.Unmarshal([]byte(value), dest)
}

// SaveConfig saves the Polymarket config to the database
func (s *PolymarketStore) SaveConfig(config domain.PolymarketConfig) error {
	return s.SaveSetting("config", config)
}

// LoadConfig loads the Polymarket config from the database
func (s *PolymarketStore) LoadConfig() (domain.PolymarketConfig, error) {
	var config domain.PolymarketConfig
	err := s.LoadSetting("config", &config)
	if err != nil {
		return domain.DefaultPolymarketConfig(), err
	}
	return config, nil
}

// SaveFilter saves the event filter to the database
func (s *PolymarketStore) SaveFilter(filter domain.PolymarketEventFilter) error {
	return s.SaveSetting("filter", filter)
}

// LoadFilter loads the event filter from the database
func (s *PolymarketStore) LoadFilter() (domain.PolymarketEventFilter, error) {
	var filter domain.PolymarketEventFilter
	err := s.LoadSetting("filter", &filter)
	if err != nil {
		return domain.PolymarketEventFilter{MinSize: 100}, err
	}
	return filter, nil
}

// SaveWallet saves or updates a wallet profile in the database
func (s *PolymarketStore) SaveWallet(profile domain.WalletProfile) error {
	_, err := s.db.Exec(`
		INSERT INTO polymarket_wallets (address, bet_count, join_date, freshness_level, is_fresh, first_seen_at, last_analyzed_at)
		VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
		ON CONFLICT(address) DO UPDATE SET
			bet_count = ?,
			join_date = ?,
			freshness_level = ?,
			is_fresh = ?,
			last_analyzed_at = ?`,
		profile.Address, profile.BetCount, profile.JoinDate, string(profile.FreshnessLevel), profile.IsFresh, profile.AnalyzedAt,
		profile.BetCount, profile.JoinDate, string(profile.FreshnessLevel), profile.IsFresh, profile.AnalyzedAt,
	)
	return err
}

// GetWallet retrieves a wallet profile from the database
func (s *PolymarketStore) GetWallet(address string) (*domain.WalletProfile, error) {
	var profile domain.WalletProfile
	var freshnessLevel sql.NullString
	var joinDate sql.NullString
	var isFresh bool
	var lastAnalyzedAt sql.NullTime

	err := s.db.QueryRow(`
		SELECT address, bet_count, join_date, freshness_level, is_fresh, first_seen_at, last_analyzed_at
		FROM polymarket_wallets WHERE address = ?`, address).
		Scan(&profile.Address, &profile.BetCount, &joinDate, &freshnessLevel, &isFresh, &profile.FirstSeen, &lastAnalyzedAt)
	if err != nil {
		return nil, err
	}

	profile.JoinDate = joinDate.String
	profile.FreshnessLevel = domain.FreshnessLevel(freshnessLevel.String)
	profile.IsFresh = isFresh
	profile.Nonce = profile.BetCount // Backward compatibility
	if lastAnalyzedAt.Valid {
		profile.AnalyzedAt = lastAnalyzedAt.Time
	}

	return &profile, nil
}

// GetFreshWallets retrieves all fresh wallets from the database
func (s *PolymarketStore) GetFreshWallets(limit int) ([]domain.WalletProfile, error) {
	if limit <= 0 {
		limit = 100
	}

	rows, err := s.db.Query(`
		SELECT address, bet_count, join_date, freshness_level, is_fresh, first_seen_at, last_analyzed_at
		FROM polymarket_wallets
		WHERE is_fresh = 1
		ORDER BY last_analyzed_at DESC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanWalletRows(rows)
}

// GetAllWallets retrieves all wallets from the database
func (s *PolymarketStore) GetAllWallets(limit int) ([]domain.WalletProfile, error) {
	if limit <= 0 {
		limit = 1000
	}

	rows, err := s.db.Query(`
		SELECT address, bet_count, join_date, freshness_level, is_fresh, first_seen_at, last_analyzed_at
		FROM polymarket_wallets
		ORDER BY first_seen_at DESC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanWalletRows(rows)
}

func (s *PolymarketStore) scanWalletRows(rows *sql.Rows) ([]domain.WalletProfile, error) {
	var wallets []domain.WalletProfile
	for rows.Next() {
		var profile domain.WalletProfile
		var joinDate sql.NullString
		var freshnessLevel sql.NullString
		var isFresh bool
		var lastAnalyzedAt sql.NullTime

		if err := rows.Scan(&profile.Address, &profile.BetCount, &joinDate, &freshnessLevel, &isFresh, &profile.FirstSeen, &lastAnalyzedAt); err != nil {
			continue
		}

		profile.JoinDate = joinDate.String
		profile.FreshnessLevel = domain.FreshnessLevel(freshnessLevel.String)
		profile.IsFresh = isFresh
		profile.Nonce = profile.BetCount // Backward compatibility
		if lastAnalyzedAt.Valid {
			profile.AnalyzedAt = lastAnalyzedAt.Time
		}
		wallets = append(wallets, profile)
	}

	return wallets, nil
}

// UpdateWalletTradeStats updates trade statistics for a wallet
func (s *PolymarketStore) UpdateWalletTradeStats(address string, tradeVolume float64) error {
	_, err := s.db.Exec(`
		UPDATE polymarket_wallets
		SET total_trades = total_trades + 1, total_volume = total_volume + ?
		WHERE address = ?`, tradeVolume, address)
	return err
}

// SaveWalletAddress saves a wallet address without analysis (for later background processing)
// Returns true if this is a new wallet, false if it already exists
func (s *PolymarketStore) SaveWalletAddress(address string) (bool, error) {
	result, err := s.db.Exec(`
		INSERT INTO polymarket_wallets (address, bet_count, first_seen_at)
		VALUES (?, -1, CURRENT_TIMESTAMP)
		ON CONFLICT(address) DO NOTHING`, address)
	if err != nil {
		return false, err
	}
	rowsAffected, _ := result.RowsAffected()
	return rowsAffected > 0, nil
}

// GetUnanalyzedWallets returns wallets that haven't been analyzed yet (bet_count = -1)
func (s *PolymarketStore) GetUnanalyzedWallets(limit int) ([]string, error) {
	if limit <= 0 {
		limit = 100
	}

	rows, err := s.db.Query(`
		SELECT address FROM polymarket_wallets
		WHERE bet_count = -1
		ORDER BY first_seen_at DESC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var addresses []string
	for rows.Next() {
		var addr string
		if err := rows.Scan(&addr); err != nil {
			continue
		}
		addresses = append(addresses, addr)
	}

	return addresses, nil
}

// GetWalletsForRefresh returns wallets that need refresh, prioritizing unanalyzed then oldest analyzed
// Only returns wallets with bet_count <= 50 (or unanalyzed with bet_count = -1)
func (s *PolymarketStore) GetWalletsForRefresh(limit int) ([]string, error) {
	if limit <= 0 {
		limit = 100
	}

	// Get unanalyzed wallets first, then wallets with <= 50 trades by oldest last_analyzed_at
	rows, err := s.db.Query(`
		SELECT address FROM polymarket_wallets
		WHERE bet_count = -1 OR bet_count <= 50
		ORDER BY
			CASE WHEN bet_count = -1 THEN 0 ELSE 1 END,
			COALESCE(last_analyzed_at, '1970-01-01') ASC
		LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var addresses []string
	for rows.Next() {
		var addr string
		if err := rows.Scan(&addr); err != nil {
			continue
		}
		addresses = append(addresses, addr)
	}

	return addresses, nil
}

// SaveNotificationConfig saves the notification config to the database
func (s *PolymarketStore) SaveNotificationConfig(config domain.NotificationConfig) error {
	return s.SaveSetting("notification_config", config)
}

// LoadNotificationConfig loads the notification config from the database
func (s *PolymarketStore) LoadNotificationConfig() (domain.NotificationConfig, error) {
	var config domain.NotificationConfig
	err := s.LoadSetting("notification_config", &config)
	if err != nil {
		return domain.DefaultNotificationConfig(), err
	}
	return config, nil
}

// HasNotified checks if an item has already been notified
func (s *PolymarketStore) HasNotified(itemType, itemID string) (bool, error) {
	var count int
	err := s.db.QueryRow(`
		SELECT COUNT(*) FROM notified_items
		WHERE item_type = ? AND item_id = ?`,
		itemType, itemID).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// MarkNotified marks an item as notified
func (s *PolymarketStore) MarkNotified(itemType, itemID string) error {
	_, err := s.db.Exec(`
		INSERT OR IGNORE INTO notified_items (item_type, item_id, notified_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)`,
		itemType, itemID)
	return err
}
