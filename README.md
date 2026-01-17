# XTools

A Twitter/X automation desktop app for keyword-based tweet discovery and AI-powered reply generation.

## Features

- **Multi-account support** - Manage multiple Twitter accounts with individual configurations
- **Keyword search** - Find tweets matching your keywords with filters (min likes, retweets, age)
- **AI reply generation** - Generate contextual replies using OpenAI-compatible LLMs
- **Approval queue** - Review and approve replies before posting, or enable auto-post mode
- **Browser authentication** - Use cookie-based auth for searching (bypasses API limitations)
- **Rate limiting** - Built-in rate limiting to avoid Twitter API restrictions
- **Auto-updates** - Check for new releases from GitHub

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

Each account config (`accounts/*.yml`) requires:

- API credentials (for posting replies)
- Browser cookies (optional, for searching via browser automation)
- LLM configuration (API key, model, persona)
