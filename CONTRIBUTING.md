# Contributing

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

Contributions are welcome. Please read this before opening a PR.

## Setup

```bash
git clone https://github.com/anishhs-gh/mail-mcp
cd mail-mcp
npm install
cp .env.example .env   # fill in your credentials
npm run dev
```

## Development

```bash
npm run dev        # start with hot reload
npm test           # run unit tests (24 tests)
npm run test:watch # watch mode
npm run build      # production build
```

## Project structure

```
src/
  server.ts          # HTTP server, two-key auth, account management endpoints
  config.ts          # Config loading (env vars → Postgres DB)
  accounts.ts        # AccountRegistry — holds MailTs instances
  types.ts           # Shared TypeScript types
  tools/             # MCP tool registrations (one file per domain)
  lib/
    db.ts            # Postgres schema, CRUD, safeDecrypt for key rotation
    crypto.ts        # AES-256-GCM encrypt/decrypt for credentials at rest
    attachment-resolver.ts
    recipients-parser.ts
    reply-builder.ts
tests/
  helpers.test.ts    # extractAttachmentMeta, ok/err helpers
  crypto.test.ts     # encrypt/decrypt roundtrip, key rotation resilience
```

## Guidelines

- **No new dependencies** without discussion — the goal is a minimal footprint
- **Tests required** for new utilities in `src/lib/`
- **Two-key auth model** — `API_KEYS` authenticates MCP and general HTTP requests; `MAIL_MCP_SECRET` authenticates only `POST /accounts/:name/password`. Never use `API_KEYS` for the password endpoint, and never expose `MAIL_MCP_SECRET` to MCP clients
- **Never log or expose credentials** — passwords must only pass through `/accounts/:name/password`
- Keep tool descriptions agent-friendly: concise, action-oriented, mention key constraints

## Pull requests

- One concern per PR
- Update `CHANGELOG.md` under `[Unreleased]`
- Run `npm test && npm run build` before pushing

## Reporting issues

Open an issue at [github.com/anishhs-gh/mail-mcp/issues](https://github.com/anishhs-gh/mail-mcp/issues).
