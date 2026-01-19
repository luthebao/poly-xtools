# Tweet Action Feature

## Overview

The Tweet Action feature enables automatic tweet generation and posting when Polymarket events are detected. It uses a multi-step LLM agent to generate contextual tweets about fresh wallet activity and trades, with optional screenshot capture.

## Feature Requirements

- Automatically tweet when fresh insiders or trades are detected on Polymarket
- Per-account configurable with multiple trigger types
- Multi-step LLM agent (not single request) for tweet generation
- Fetch context from Polymarket market URLs and wallet profile URLs
- Optional screenshot capture to attach to tweets
- RAG (Retrieval Augmented Generation) with historical tweets and curated examples
- Support custom prompts per account
- Robust error handling with retry and backoff

## Architecture

The feature follows the existing Hexagonal/Clean Architecture pattern with:

- **Domain**: Core types and business logic
- **Ports**: Interface definitions
- **Adapters**: External service implementations
- **Services**: Business logic orchestration

### Event Flow

```
Polymarket Watcher
       │
       ▼
   EventBus
       │
       ├── polymarket:fresh_wallet_detected
       │
       └── polymarket:event
               │
               ▼
       ActionService
               │
               ├── Check trigger conditions
               ├── Check deduplication
               └── Create and enqueue action
                       │
                       ▼
               Queue Worker (30s interval)
                       │
                       ├── Generate tweet (LLM Agent)
                       ├── Capture screenshot (optional)
                       └── Post tweet (Twitter API)
```

## Backend Implementation

### New Files Created

#### 1. Domain Types (`internal/domain/actions.go`)

```go
// Trigger types
const (
    TriggerFreshInsider   ActionTriggerType = "fresh_insider"   // 0-1 bets
    TriggerFreshWallet    ActionTriggerType = "fresh_wallet"    // 0-5 bets
    TriggerBigTrade       ActionTriggerType = "big_trade"       // Min trade size
    TriggerAnyTrade       ActionTriggerType = "any_trade"       // All trades
    TriggerCustomBetCount ActionTriggerType = "custom_bet_count" // Custom threshold
)

// Screenshot modes
const (
    ScreenshotNone    ActionScreenshotMode = "none"
    ScreenshotMarket  ActionScreenshotMode = "market"
    ScreenshotProfile ActionScreenshotMode = "profile"
)

// Action statuses
const (
    ActionStatusPending    ActionStatus = "pending"
    ActionStatusFetching   ActionStatus = "fetching"
    ActionStatusGenerating ActionStatus = "generating"
    ActionStatusCapturing  ActionStatus = "capturing"
    ActionStatusPosting    ActionStatus = "posting"
    ActionStatusCompleted  ActionStatus = "completed"
    ActionStatusFailed     ActionStatus = "failed"
)
```

**Key Types:**

- `ActionsConfig` - Per-account configuration
- `TweetAction` - Action entity with full state
- `TweetActionHistory` - Simplified history record
- `ActionStats` - Statistics for UI
- `ActionGenerationRequest/Response` - LLM request/response

#### 2. Port Interfaces (`internal/ports/actions.go`)

```go
type ActionStore interface {
    EnqueueAction(action domain.TweetAction) error
    DequeueActions(accountID string, limit int) ([]domain.TweetAction, error)
    UpdateAction(action domain.TweetAction) error
    GetPendingActions(accountID string) ([]domain.TweetAction, error)
    GetActionHistory(accountID string, limit int) ([]domain.TweetActionHistory, error)
    GetActionStats(accountID string) (*domain.ActionStats, error)
    HasActionForEvent(accountID string, eventID int64) (bool, error)
    MarkActionForEvent(accountID string, eventID int64, actionID string) error
    GetRetryableActions(limit int) ([]domain.TweetAction, error)
}

type ActionAgent interface {
    GenerateTweet(ctx context.Context, req domain.ActionGenerationRequest) (*domain.ActionGenerationResponse, error)
    GenerateDraft(ctx context.Context, req domain.ActionGenerationRequest) (string, int, error)
    ReviewAndRefine(ctx context.Context, draft string, req domain.ActionGenerationRequest) (string, int, error)
}

type ScreenshotCapture interface {
    CaptureMarket(ctx context.Context, marketSlug string) (string, error)
    CaptureProfile(ctx context.Context, walletAddress string) (string, error)
    Close() error
}
```

#### 3. Action Store (`internal/adapters/storage/action_store.go`)

SQLite implementation with tables:

- `tweet_actions` - Main action queue and history
- `action_event_log` - Deduplication tracking

Features:

- Queue operations (enqueue, dequeue)
- Status tracking and updates
- History queries with pagination
- Statistics aggregation
- Retry scheduling with exponential backoff

#### 4. Tweet Agent (`internal/adapters/actions/agent.go`)

Multi-step LLM agent using OpenAI-compatible API:

**Pipeline:**

1. **GenerateDraft** - Initial tweet generation with full context
2. **ReviewAndRefine** - Improve draft using examples (if provided)

**Context Building:**

- Trade event details (market, outcome, price, size)
- Wallet profile (address, bet count, freshness level)
- Market and profile URLs
- Historical tweets (RAG)
- Curated example tweets

#### 5. Screenshot Capture (`internal/adapters/actions/screenshot.go`)

Browser automation using go-rod:

- Lazy browser initialization
- Headless Chrome
- Market page capture
- Profile page capture
- Screenshot storage with timestamps

#### 6. Action Service (`internal/services/action_service.go`)

Main orchestration service:

**Event Subscriptions:**

- `polymarket:fresh_wallet_detected`
- `polymarket:event`

**Background Workers:**

- Queue processor (30s interval)
- Retry worker (60s interval)

**Pipeline:**

1. Trigger matching based on account config
2. Deduplication check
3. Action creation and enqueuing
4. Status updates via EventBus
5. LLM tweet generation
6. Optional screenshot capture
7. Tweet posting via Twitter API
8. Error handling with retry scheduling

### Modified Files

#### 7. Account Domain (`internal/domain/account.go`)

Added `ActionsConfig` field to `AccountConfig`:

```go
type AccountConfig struct {
    // ... existing fields ...
    ActionsConfig ActionsConfig `yaml:"actions_config" json:"actionsConfig"`
}
```

#### 8. Handlers (`internal/handlers/handlers.go`)

Added action service and handlers:

- `GetPendingActions(accountID string)`
- `GetActionHistory(accountID string, limit int)`
- `GetActionStats(accountID string)`
- `TestTweetAction(accountID string)`

#### 9. App (`app.go`)

- Initialize ActionStore, ScreenshotCapture, ActionService
- Wire up dependencies
- Start/stop action service
- Add App binding methods for frontend

## Frontend Implementation

### Types (`frontend/src/types/index.ts`)

```typescript
export type ActionTriggerType = string;
export type ActionScreenshotMode = string;
export type ActionStatus = string;

export interface ActionsConfig {
    enabled: boolean;
    triggerType: ActionTriggerType;
    customBetCount: number;
    minTradeSize: number;
    screenshotMode: ActionScreenshotMode;
    customPrompt: string;
    exampleTweets: string[];
    useHistorical: boolean;
    reviewEnabled: boolean;
    maxRetries: number;
    retryBackoffSecs: number;
}

export interface ActionStats {
    totalActions: number;
    pendingCount: number;
    completedCount: number;
    failedCount: number;
    queuedCount: number;
    totalTokensUsed: number;
}
```

### Account Detail Page (`frontend/src/pages/AccountDetail.tsx`)

Added "Tweet Actions (Polymarket)" card in Worker Control section:

**Features:**

- Enable/disable toggle with visual status indicator
- Quick config badges (trigger type, screenshot mode)
- Test action button
- Expandable configuration panel
- Action statistics display

**ActionsConfigPanel Component:**

- Trigger type dropdown
- Screenshot mode dropdown
- Conditional fields (custom bet count, min trade size)
- Custom system prompt textarea
- Example tweets list with add/remove
- Historical tweets toggle
- Review step toggle
- Retry settings (max retries, backoff)
- Save changes button

## Configuration

### Per-Account Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| enabled | bool | false | Enable/disable actions |
| triggerType | string | "fresh_insider" | When to trigger |
| customBetCount | int | 3 | For custom trigger |
| minTradeSize | float | 1000 | For big trade trigger |
| screenshotMode | string | "none" | Screenshot capture |
| customPrompt | string | "" | Custom LLM prompt |
| exampleTweets | []string | [] | Style reference |
| useHistorical | bool | true | Use past tweets |
| reviewEnabled | bool | true | Enable review step |
| maxRetries | int | 3 | Max retry attempts |
| retryBackoffSecs | int | 60 | Base backoff |

### Trigger Types

| Trigger | Description | Condition |
|---------|-------------|-----------|
| fresh_insider | Brand new wallet | bet_count <= 1 |
| fresh_wallet | Fresh wallet | bet_count <= 5 |
| big_trade | Large trades only | notional >= minTradeSize |
| any_trade | All trades | Has trade event |
| custom_bet_count | Custom threshold | bet_count <= customBetCount |

## Database Schema

### tweet_actions

```sql
CREATE TABLE tweet_actions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    wallet_address TEXT,
    wallet_profile TEXT,
    trade_event TEXT,
    market_url TEXT,
    profile_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    draft_text TEXT,
    reviewed_text TEXT,
    final_text TEXT,
    screenshot_path TEXT,
    posted_tweet_id TEXT,
    retry_count INTEGER DEFAULT 0,
    next_retry_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    processed_at TEXT
);
```

### action_event_log

```sql
CREATE TABLE action_event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    event_id INTEGER NOT NULL,
    action_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(account_id, event_id)
);
```

## API Endpoints (Wails Bindings)

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| GetPendingActions | accountID | []TweetAction | Get pending actions |
| GetActionHistory | accountID, limit | []TweetActionHistory | Get action history |
| GetActionStats | accountID | ActionStats | Get statistics |
| TestTweetAction | accountID | error | Trigger test action |

## Error Handling

1. **Generation Failure**: Retry with exponential backoff
2. **Screenshot Failure**: Continue without screenshot (non-fatal)
3. **Posting Failure**: Retry up to maxRetries
4. **Max Retries Exceeded**: Mark as failed, emit event

### Retry Logic

```
delay = retryBackoffSecs * 2^(retryCount-1)
```

Example with 60s base backoff:

- Retry 1: 60s
- Retry 2: 120s
- Retry 3: 240s

## Events Emitted

| Event | Data | Description |
|-------|------|-------------|
| action:queued | TweetAction | Action enqueued |
| action:generating | TweetAction | LLM generation started |
| action:posting | TweetAction | Tweet posting started |
| action:completed | TweetAction | Successfully posted |
| action:failed | TweetAction | Max retries exceeded |

## Dependencies

### Go Packages

- `github.com/go-rod/rod` - Browser automation
- `github.com/google/uuid` - UUID generation

### Existing Internal Packages

- `internal/adapters/events` - EventBus
- `internal/adapters/llm` - LLM client (OpenAI-compatible)
- `internal/services` - AccountService, etc.

## Usage

1. Enable Polymarket Watcher in Settings
2. Configure Actions in Account Detail > Actions tab
3. Set trigger type and other options
4. Enable actions with the toggle
5. Monitor activity in the Actions tab

## Future Enhancements

- [ ] Media upload support (attach screenshots to tweets)
- [ ] Multiple screenshot modes (combine market + profile)
- [ ] Webhook notifications for action events
- [ ] Action analytics dashboard
- [ ] Custom action templates
- [ ] Scheduled/delayed posting
