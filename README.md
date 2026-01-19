# PolyXTools

A multi-purpose desktop app featuring Twitter/X automation and Polymarket trade monitoring with fresh wallet detection.

## Features

### Twitter Automation

- **Multi-account support** - Manage multiple Twitter accounts with individual configurations
- **Keyword search** - Find tweets matching your keywords with filters (min likes, retweets, age)
- **AI reply generation** - Generate contextual replies using OpenAI-compatible LLMs
- **Approval queue** - Review and approve replies before posting, or enable auto-post mode
- **Browser authentication** - Use cookie-based auth for searching (bypasses API limitations)
- **Rate limiting** - Built-in rate limiting to avoid Twitter API restrictions

### Polymarket Watcher

- **Live trade feed** - Real-time WebSocket connection to Polymarket trade data
- **Fresh wallet detection** - Identify new/insider wallets based on total trade count
- **Configurable thresholds** - Set custom bet count thresholds for freshness levels (insider, fresh, newbie)
- **Trade filtering** - Filter by minimum value, side (buy/sell), market name
- **Wallet tracking** - Background analysis of wallet profiles with auto-refresh
- **Sortable wallet table** - View all tracked wallets with sorting and filtering

### General

- **Auto-updates** - Check for new releases from GitHub
- **Cross-platform** - macOS, Windows, Linux support

## Tech Stack

- **Backend**: Go with Hexagonal Architecture
- **Frontend**: React + TypeScript + shadcn/ui + TailwindCSS
- **Desktop**: Wails v2
- **Storage**: SQLite + YAML configs

## Quick Start

```bash
# Prerequisites
go install github.com/wailsapp/wails/v2/cmd/wails@latest
cd frontend && pnpm install

# Development
wails dev

# Build
wails build
```

## Configuration

Data is stored in the OS-specific application directory:

- **macOS**: `~/Library/Application Support/XTools/`
- **Windows**: `%AppData%/XTools/`
- **Linux**: `~/.config/XTools/`

### Twitter Accounts

Each account config (`accounts/*.yml`) requires:

- API credentials (for posting replies)
- Browser cookies (optional, for searching via browser automation)
- LLM configuration (API key, model, persona)

### Polymarket Settings

Fresh wallet detection thresholds are configurable in the app:

- **Insider** (0-3 bets): Highest confidence, likely insider
- **Fresh** (0-10 bets): Very new wallet
- **Newbie** (0-20 bets): New user
- **Custom**: User-defined threshold

## Build & Development Commands

```bash
# Prerequisites
go install github.com/wailsapp/wails/v2/cmd/wails@latest
cd frontend && pnpm install

# Development (hot reload)
wails dev

# Production build
wails build

# Frontend only (from frontend/)
pnpm run build
pnpm run dev

# Go only (from root)
go build .

# Platform builds (scripts/)
./scripts/build-macos.sh        # macOS universal
./scripts/build-macos-arm.sh    # macOS ARM
./scripts/build-macos-intel.sh  # macOS Intel
./scripts/build-windows.sh      # Windows
```

## Architecture

XTools is a Twitter automation desktop app using **Wails v2** (Go + React) with **Hexagonal/Clean Architecture**.

### Backend Structure (internal/)

**Domain Layer** (`internal/domain/`):

- Core types: `AccountConfig`, `Tweet`, `Reply`, `ApprovalQueueItem`, metrics types
- Business rules independent of infrastructure

**Ports Layer** (`internal/ports/`):

- Interface contracts for external dependencies
- `TwitterClient` - abstracts API vs Browser automation
- `ConfigStore`, `MetricsStore`, `ReplyStore`, `ExcelExporter` - storage interfaces
- `LLMProvider`, `RateLimiter`, `EventBus` - utility interfaces

**Adapters Layer** (`internal/adapters/`):

- `twitter/` - API client (OAuth 1.0a for posting, bearer for reading) and Browser client (go-rod for searching only)
- `storage/` - YAML configs, SQLite metrics, Excel export, reply queue
- `llm/` - OpenAI-compatible chat completion
- `events/` - Wails runtime event emission
- `ratelimit/` - Token bucket implementation
- `activity/` - In-memory activity logging
- `polymarket/` - WebSocket client for live trade data, wallet analyzer for fresh wallet detection

**Services Layer** (`internal/services/`):

- `AccountService` - account CRUD, Twitter client lifecycle
- `SearchService` - keyword search, filtering, Excel saving
- `ReplyService` - LLM generation, approval queue, posting
- `PolymarketService` - Polymarket trade watching, fresh wallet detection

**Workers Layer** (`internal/workers/`):

- `WorkerPool` - manages per-account background workers
- `SearchWorker` - periodic search execution per account

**Handlers Layer** (`internal/handlers/`):

- Wails-bound methods for frontend calls

### Wails Binding Pattern

Methods exposed to frontend are defined on `App` struct in `app.go` and delegate to `handlers.Handlers`:

```go
// app.go - exposed to frontend
func (a *App) GetAccounts() ([]domain.AccountConfig, error) {
    return a.handlers.GetAccounts()
}
```

Frontend calls via generated bindings in `frontend/wailsjs/go/main/App.js`.

### Frontend Structure (frontend/src/)

- **State**: Zustand stores in `store/` (accountStore, replyStore, searchStore, uiStore)
- **Routing**: React Router with Layout wrapper
- **Pages**: Dashboard, Accounts, Search, Replies, Metrics, Settings
- **UI Components**: Uses shadcn/ui (`components/ui/`) with Radix primitives + Tailwind
- **Common Components**: `components/common/` for Layout, Sidebar, ConfirmModal
- **Types**: `types/index.ts` mirrors Go domain types
- **Utils**: `lib/utils.ts` exports `cn()` for className merging

### Data Flow

1. Frontend calls Wails binding → `app.go` method
2. `app.go` delegates to `handlers.Handlers`
3. Handler orchestrates services
4. Services use port interfaces (adapters inject implementations)
5. Events emitted via `EventBus` for real-time UI updates

### Authentication Architecture

- **Browser auth** (`auth_type: browser`): Used for searching tweets via go-rod browser automation
- **API auth**: Always required for posting replies (OAuth 1.0a)
- **Hybrid setup**: Browser accounts must also have API credentials for posting
- Rate limiting: API posts wait and retry on 429 errors

### Tools Configuration

Data stored in OS-specific application directory:

- **macOS**: `~/Library/Application Support/XTools/`
- **Windows**: `%AppData%/XTools/`
- **Linux**: `~/.config/XTools/`

Within the data directory:

- `accounts/*.yml` - Account configs (one file per account)
- `xtools.db` - SQLite database with WAL mode (metrics, replies)
- `exports/` - Excel files per account

### Version & Updates

- Version constant: `internal/version/version.go` - update before releases
- Updater: `internal/adapters/updater/` - checks GitHub releases API
- Frontend calls `GetAppVersion()` and `CheckForUpdates()` via Wails bindings

### Account Config Requirements

Browser-type accounts need both:

1. `browser_auth.cookies` - for searching (extracted via Account Editor modal)
2. `api_credentials` (apiKey, apiSecret, accessToken, accessSecret) - for posting replies

## Frontend Error Handling

Wails returns Go errors as **strings**, not objects. Always handle errors like:

```typescript
catch (err: any) {
  const errorMsg = typeof err === 'string' ? err : (err?.message || 'Default error');
  showToast(errorMsg, 'error');
}
```

## LLM Prompt Structure

The LLM reply generation uses a two-part prompt:

- **System prompt**: `llm_config.persona` from account config (defines bot personality)
- **User prompt**: Built dynamically with post content, author bio, thread context, and character limit instruction

## Adding shadcn/ui Components

Use the shadcn CLI from the frontend directory:

```bash
cd frontend && pnpm dlx shadcn@latest add <component-name>
```

Components are placed in `frontend/src/components/ui/` and re-exported from `index.ts`.

## Polymarket Watcher

The Polymarket watcher monitors live trades via WebSocket (`wss://ws-live-data.polymarket.com`) and detects fresh wallets using the Polymarket Data API.

**Key components:**

- `internal/adapters/polymarket/websocket.go` - WebSocket connection with auto-reconnect
- `internal/adapters/polymarket/wallet_analyzer.go` - Fetches wallet bet count via Polymarket Data API (`/trades?user=...`)
- `internal/services/polymarket.go` - Orchestrates watching, filtering, and storage
- `internal/adapters/storage/polymarket_store.go` - SQLite storage for events and settings

**Fresh wallet detection levels (based on total bet count):**

- `FreshnessInsider` (0-3 bets): Likely insider, highest confidence
- `FreshnessWallet` (0-10 bets): Fresh wallet
- `FreshnessNewbie` (0-20 bets): New user
- `FreshnessCustom`: Uses custom threshold (`customFreshMaxBets` config)

**Real-time event flow:**

1. WebSocket receives trade → `onEvent` callback
2. Event checked against save filter (min size, side, market name, etc.)
3. Wallet address saved to `polymarket_wallets` table for background analysis
4. Event saved to `polymarket_events` table and emitted via `EventBus` to frontend
5. Frontend receives via `EventsOn('polymarket:event', handler)`

**Background wallet analysis:**

- Worker runs every 10 seconds, processes 10 wallets per batch
- Only re-fetches wallets with `bet_count <= 50` (fresh candidates)
- Uses Polymarket Profile API: `https://polymarket.com/api/profile/stats?proxyAddress=...`
- Returns `{trades, largestWin, views, joinDate}`

**Settings persistence:** Filter and bet count thresholds stored in `polymarket_settings` table, loaded on service startup.

## Frontend Pages

- **Polymarket Live** (`/polymarket`): Real-time trade feed with fresh wallet highlighting
- **Wallets** (`/polymarket/wallets`): All tracked wallets with sorting (click column headers) and filtering

## Wails Event Subscriptions

Frontend subscribes to backend events via `EventsOn()`:

```typescript
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime';

useEffect(() => {
    EventsOn('polymarket:event', (event) => { /* handle */ });
    return () => EventsOff('polymarket:event');
}, []);
```

Common events: `polymarket:event`, `polymarket:fresh_wallet`, `polymarket:fresh_wallet_detected`
