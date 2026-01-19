# PolyXTools Refactoring & Optimization Plan

**Date:** 2026-01-19
**Status:** Design Approved
**Approach:** Incremental Refactoring (7 weeks)

## Overview

This plan addresses critical architecture and performance issues in PolyXTools through a systematic, incremental refactoring approach. The app remains fully functional throughout, allowing feature development to continue in parallel.

## Current State Assessment

### Critical Issues Identified

| Issue | Location | Impact |
|-------|----------|--------|
| 722-line file | `polymarket_store.go` | Hard to navigate, multiple concerns mixed |
| 509-line file | `action_service.go` | Violates single responsibility principle |
| N+1 queries | `polymarket_store.go:540-557` | Poor database performance with scale |
| Missing indexes | `polymarket_events` table | Slow queries on large datasets |
| OFFSET pagination | Multiple repositories | Inefficient for large result sets |
| Goroutine leaks | `websocket.go` | Memory leaks over time |
| No state cleanup | Frontend stores | Memory grows with usage |
| Hard-coded values | ~15 instances | Difficult to tune, deployment risks |

## Refactoring Approach

### Chosen Approach: Incremental Refactoring

Fix one bounded context at a time while keeping the app fully functional.

**Why this approach:**

- App always works - can ship features alongside refactoring
- Lower risk - issues caught early in small batches
- Easy to pause/resume based on priorities
- Tests can validate each increment

## Implementation Phases

### Phase 1: Critical Architecture (Weeks 1-2)

#### Split `polymarket_store.go` (722 lines)

Divide into focused files under `internal/adapters/storage/polymarket/`:

**1. `migrations.go` (~80 lines)**

- Database schema creation
- Migration functions
- Table initialization logic

**2. `event_repository.go` (~180 lines)**

- `EventRepository` interface (ports layer)
- SQLite implementation for events CRUD
- Event filtering and querying logic
- Real-time event emission hooks

**3. `wallet_repository.go` (~150 lines)**

- `WalletRepository` interface
- Wallet profile CRUD operations
- Fresh wallet queries with batch operations
- Wallet analysis result storage

**4. `settings_repository.go` (~120 lines)**

- `SettingsRepository` interface
- Polymarket settings persistence
- Threshold configuration storage
- Filter preferences management

#### Split `action_service.go` (509 lines)

Divide into focused services under `internal/services/`:

**1. `action_creation_service.go` (~120 lines)**

- Action validation and creation
- Screenshot capture orchestration
- Initial persistence logic

**2. `action_processing_service.go` (~180 lines)**

- Queue management (pending → processing → completed)
- Status transitions and state management
- Processing workflow orchestration

**3. `action_retry_service.go` (~100 lines)**

- Retry logic and backoff strategy
- Failed action recovery
- Error categorization and handling

### Phase 2: Configuration Management (Week 3)

#### Centralized Configuration Structure

```
internal/config/
├── config.go           # Main config loader and validator
├── database.go         # Database settings
├── api.go              # External API endpoints and timeouts
├── workers.go          # Worker pool settings
└── polymarket.go       # Polymarket-specific thresholds
```

#### Configurations to Extract

| Hard-coded Value | Location | New Config Key |
|-----------------|----------|----------------|
| `30 * time.Second` | action_service.go | `workers.actionQueueInterval` |
| `60 * time.Second` | Multiple files | `api.defaultTimeout` |
| `10 * time.Second` | websocket.go | `websocket.pingInterval` |
| `100` (min trade) | polymarket_service.go | `polymarket.minTradeSize` |
| `50` (wallet threshold) | wallet_analyzer.go | `polymarket.walletRefreshThreshold` |
| `5` (max retries) | action_service.go | `workers.maxRetries` |

#### Configuration Loading

```go
// config/config.go
type Config struct {
    Database   DatabaseConfig
    API        APIConfig
    Workers    WorkersConfig
    Polymarket PolymarketConfig
}

func Load() (*Config, error) {
    // Load from YAML in app data directory
    // Apply environment variable overrides
    // Validate required fields and ranges
}
```

### Phase 3: Database Optimization (Weeks 4-5)

#### Add Composite Indexes

For `polymarket_events` table:

```sql
-- For filtering by side and timestamp
CREATE INDEX idx_events_side_timestamp
ON polymarket_events(side, created_at DESC);

-- For market-specific queries with size filtering
CREATE INDEX idx_events_market_size
ON polymarket_events(market_id, size_usd);

-- For fresh wallet detection queries
CREATE INDEX idx_events_wallet_timestamp
ON polymarket_events(wallet_address, created_at DESC);
```

For `polymarket_wallets` table:

```sql
-- For fresh wallet queries with bet count filtering
CREATE INDEX idx_wallets_freshness
ON polymarket_wallets(bet_count, last_updated);

-- For sorting and filtering
CREATE INDEX idx_wallets_updated
ON polymarket_wallets(last_updated DESC);
```

#### Cursor-Based Pagination

Replace OFFSET-based pagination with cursor-based approach:

```go
type Cursor struct {
    ID        string    `json:"id"`
    Timestamp time.Time `json:"timestamp"`
}

func (r *EventRepository) GetPaginated(
    limit int,
    cursor *Cursor,
) ([]domain.PolymarketEvent, *Cursor, error) {
    // WHERE (id, created_at) > (cursor.ID, cursor.Timestamp)
    // ORDER BY id, created_at
    // LIMIT limit
    // Returns new cursor for next page
}
```

#### Fix N+1 Query Pattern

Replace individual queries with batch operations:

```go
func (r *WalletRepository) GetFreshWalletsWithProfiles(
    limit int,
    maxBets int,
) ([]domain.WalletProfile, error) {
    // Single JOIN query or batch IN clause
    // Returns wallets with already-loaded profiles
    // No individual queries per wallet
}
```

### Phase 4: Resource Management (Weeks 6-7)

#### Goroutine Lifecycle Tracking

```go
// internal/adapters/polymarket/lifecycle.go
type GoroutineManager struct {
    active   map[int64]context.CancelFunc
    mu       sync.RWMutex
    shutdown chan struct{}
}

func (m *GoroutineManager) Go(ctx context.Context, fn func(context.Context)) (int64, error) {
    childCtx, cancel := context.WithCancel(ctx)
    id := nextID()

    m.mu.Lock()
    m.active[id] = cancel
    m.mu.Unlock()

    go func() {
        defer func() {
            m.mu.Lock()
            delete(m.active, id)
            m.mu.Unlock()
        }()
        fn(childCtx)
    }()

    return id, nil
}

func (m *GoroutineManager) Shutdown(timeout time.Duration) error {
    // Cancel all goroutines
    // Wait for completion or timeout
}
```

#### Frontend State Cleanup

```typescript
// store/pollingStore.ts
interface PollingState {
  tweets: Record<string, Tweet[]>
  lastCleanup: number
  maxAge: number // 30 minutes
}

const usePollingStore = create<PollingState>((set, get) => ({
  // ... existing actions

  cleanupOldTweets: () => {
    const { tweets, maxAge } = get();
    const cutoff = Date.now() - maxAge;

    Object.entries(tweets).forEach(([accountId, accountTweets]) => {
      const filtered = accountTweets.filter(t => t.timestamp > cutoff);
      if (filtered.length !== accountTweets.length) {
        set(state => ({
          tweets: { ...state.tweets, [accountId]: filtered }
        }));
      }
    });
  },

  // Run cleanup every 5 minutes
  startCleanup: () => setInterval(() => get().cleanupOldTweets(), 5 * 60 * 1000)
}));
```

#### Adaptive Worker Scaling

```go
// internal/workers/adaptive_pool.go
type AdaptivePool struct {
    minWorkers int
    maxWorkers int
    current    int
    queueDepth int
    scalingFn  func(depth, current int) int
}

func (p *AdaptivePool) Adjust() {
    target := p.scalingFn(p.queueDepth, p.current)
    target = clamp(target, p.minWorkers, p.maxWorkers)

    // Spin up or tear down workers as needed
    for p.current < target {
        p.spawnWorker()
        p.current++
    }
    for p.current > target {
        p.stopWorker()
        p.current--
    }
}
```

Scaling heuristic: scale up when queue depth > 2× workers, scale down when queue depth < workers/2.

## Testing Strategy

### Per-Phase Testing

**Phase 1 (Architecture):**

- Unit tests for each new repository with in-memory SQLite
- Service interface mocking tests
- Integration tests for repository → service flow

**Phase 2 (Configuration):**

- Config loading tests with valid/invalid YAML
- Environment override tests
- Schema validation tests

**Phase 3 (Database):**

- Benchmark queries before/after indexing
- Pagination correctness tests
- N+1 query detection tests

**Phase 4 (Resources):**

- Goroutine leak tests
- Memory profiling during operations
- Frontend memory usage tests
- Worker scaling behavior tests

### Performance Metrics to Track

- Database query time (p95, p99)
- Memory usage (steady state, peak)
- Goroutine count (steady state, peak)
- Frontend render time
- Bundle size

## Success Criteria

### Code Quality

- ✅ All Go files under 300 lines
- ✅ All services implement clean interfaces
- ✅ Zero hard-coded timeouts/limits in production code

### Database Performance

- ✅ p95 query time < 50ms for common queries
- ✅ Zero N+1 query patterns
- ✅ Pagination works efficiently with 10,000+ events

### Resource Usage

- ✅ Steady-state memory < 200MB
- ✅ All goroutines exit within 5 seconds of shutdown
- ✅ Frontend memory stable over 1 hour of use

### Architecture Health

- ✅ Repository pattern implemented for all data access
- ✅ Dependency injection used throughout service layer
- ✅ Clear separation between domain, ports, and adapters

### Development Velocity

- ✅ New features can be added without modifying existing service code
- ✅ Tests can mock all external dependencies
- ✅ Configuration changes don't require code changes

## Implementation Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Repository Foundation | Interfaces, migrations, EventRepository |
| 2 | Complete Repository Split | WalletRepository, SettingsRepository, delete old file |
| 3 | Configuration Management | Config package, YAML loading, validation |
| 4 | Database Indexes | Composite indexes, migration, benchmarks |
| 5 | Cursor Pagination | Cursor-based queries, frontend updates |
| 6 | Goroutine Lifecycle | GoroutineManager, WebSocket updates |
| 7 | Frontend & Scaling | State cleanup, adaptive workers, profiling |

Each week's changes are isolated and can be committed independently. The app remains fully functional throughout.

## Next Steps

1. Review and approve this design document
2. Create detailed implementation plan with `superpowers:writing-plans`
3. Set up isolated git worktree with `superpowers:using-git-worktrees`
4. Begin Phase 1 implementation
