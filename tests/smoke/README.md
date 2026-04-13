# Smoke tests (Tradeflow)

This folder holds **manual smoke scenarios** for fast “does the app basically work?” checks before releases or after risky changes. They are written for the **desktop app** (`apps/desktop`), which uses React Router paths under `/accounting/…`.

## Prerequisites

- **API** running and reachable by the desktop client (per your local setup).
- **Desktop app** running (typically Vite + Electron dev, or a packaged build).
- A user account with at least **`accounting:read`** for read-only scenarios; add **`accounting:write`** where scenarios mention creating or saving data.

## Focus areas (initial)

| Area | Document | Main routes |
|------|----------|-------------|
| Chart of accounts & defaults | [chart-of-accounts.md](./chart-of-accounts.md) | `/accounting/coa` |
| Journals & financial reports | [core-accounting.md](./core-accounting.md) | `/accounting/journals`, `/accounting/reports` |

## Automation (later)

These files are scenario specs. When you add Playwright, Vitest + Testing Library, or another runner, map each **Scenario ID** to an automated test and keep the same IDs for traceability.
