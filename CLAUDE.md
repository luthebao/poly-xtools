# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Constraints

- Use pnpm (not npm/yarn) for frontend dependencies
- Maximum Go file length: 200-300 lines. Break longer files into focused modules.
- Never generate icons/images in Go code - use external image files
- Wails webview doesn't support `window.confirm()` / `window.alert()` - use custom modal components instead
- Any plans or new features must be documented in the `docs/` folder before implementation, with format `docs/<YYYY-MM-DD>-<INDEX>-<feature-name>.md` or `docs/plans/<YYYY-MM-DD>-<INDEX>-<plan-name>.md`

## References

- [README.md](README.md) for project overview and setup instructions
- Wails documentation: [docs](https://wails.io/docs/)
- Polymarket API docs: [https://docs.polymarket.com/quickstart/overview](https://docs.polymarket.com/quickstart/overview)
- Documents for features: [docs/](docs/)
