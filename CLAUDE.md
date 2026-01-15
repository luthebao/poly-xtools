# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Constraints

- Use pnpm (not npm/yarn) for frontend dependencies
- Maximum Go file length: 200-300 lines. Break longer files into focused modules.
- Never generate icons/images in Go code - use external image files
- Wails webview doesn't support `window.confirm()` / `window.alert()` - use custom modal components instead

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

**Services Layer** (`internal/services/`):

- `AccountService` - account CRUD, Twitter client lifecycle
- `SearchService` - keyword search, filtering, Excel saving
- `ReplyService` - LLM generation, approval queue, posting

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
- **Components**: `components/common/` for shared UI (Card, Button, Layout, Sidebar, Toast)
- **Types**: `types/index.ts` mirrors Go domain types

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

### Configuration

- Account configs: `data/accounts/*.yml` (one file per account)
- Database: `data/xtools.db` (SQLite with WAL mode)
- Exports: `data/exports/` (Excel files per account)

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
