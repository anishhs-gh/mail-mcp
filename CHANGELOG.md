# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [0.1.0] - 2026-06-23

### Added
- 20 MCP tools covering send, read, search, reply, forward, drafts, flags, mailbox management, bulk, templates, queue, and account management
- Postgres-backed multi-account management with AES-256-GCM encrypted credentials
- `POST /accounts/:name/password` — credentials set directly, never through the agent; authenticated with `MAIL_MCP_SECRET` (not `API_KEYS`) so the agent is cryptographically prevented from calling it
- `GET /accounts`, `PATCH /accounts/:name`, `DELETE /accounts/:name` HTTP endpoints
- `safeDecrypt` — graceful empty-string fallback when `MAIL_MCP_SECRET` is rotated; server starts cleanly and logs a warning to re-set affected passwords
- Two-key auth model: `API_KEYS` for all MCP and general HTTP requests; `MAIL_MCP_SECRET` exclusively for the password endpoint
- `textOnly` fetch mode via `@mailts/core` BODYSTRUCTURE — bandwidth-efficient email reading
- `search_emails` using `ImapSession.search()` — no raw IMAP client exposure
- `get_thread` using `ImapSession` with parallel header searches
- `get_attachments` with structure-only mode (no attachment bytes when `download: false`)
- `extractAttachmentMeta` helper — walks BODYSTRUCTURE tree for attachment metadata
- Vitest unit test suite (24 tests) covering helpers, BODYSTRUCTURE parsing, crypto roundtrip, and key rotation resilience
- Config loading priority: env vars (default account) → Postgres DB (additional accounts)
- `@mailts/core` 0.4.0 from npm
