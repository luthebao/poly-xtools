# XTools

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
