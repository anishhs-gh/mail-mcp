<div align="center">

<img src="https://mailts.anishhs.com/logo-icon.png" alt="mail-mcp" width="38" />

# mail-mcp

**A self-hosted MCP server that gives AI agents full email superpowers.**

Read, search, send, reply, manage mailboxes and accounts — over any SMTP/IMAP provider.

[![CI](https://img.shields.io/github/actions/workflow/status/anishhs-gh/mail-mcp/ci.yml?branch=main&label=CI)](https://github.com/anishhs-gh/mail-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![@mailts/core](https://img.shields.io/badge/%40mailts%2Fcore-0.4.0-purple)](https://www.npmjs.com/package/@mailts/core)

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 📨 **20 MCP tools** | Read, search, send, reply, forward, draft, flag, move, delete, bulk send, templates, queue |
| 🔐 **Secure multi-account** | Credentials encrypted at rest (AES-256-GCM); passwords never pass through the agent |
| ⚡ **Efficient reads** | BODYSTRUCTURE-driven selective fetch — text only, no attachment bytes wasted |
| 🗄️ **Postgres-backed** | Accounts managed at runtime via the agent; persists across restarts |
| 🌐 **Provider-agnostic** | Gmail, Fastmail, Outlook, or any IMAP/SMTP server |
| 🐳 **Docker-ready** | Single container; deploy to Cloud Run, Fly.io, Railway, or anywhere |

---

## 🚀 Quick Start

### Single account (no database needed)

```env
# .env
API_KEYS=your-secret-key

IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=you@gmail.com
IMAP_PASS=your-app-password

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
```

```bash
npm install && npm run dev
# → Listening on http://localhost:3000/mcp
```

### Multi-account with Postgres

```env
# .env
API_KEYS=your-secret-key
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require
MAIL_MCP_SECRET=any-random-string-32-chars
SERVER_URL=https://your-server.example.com

# Optional default account (always loaded from env)
IMAP_HOST=imap.gmail.com
IMAP_USER=you@gmail.com
IMAP_PASS=your-app-password
SMTP_HOST=smtp.gmail.com
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
```

The `mail_mcp_accounts` table is created automatically on first run. Add more accounts via the agent at any time.

---

## 🔧 Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_KEYS` | ✅ | — | Comma-separated Bearer tokens for MCP auth |
| `DATABASE_URL` | Multi-account | — | Standard Postgres connection string |
| `MAIL_MCP_SECRET` | With DB | — | Encryption key for credentials at rest |
| `SERVER_URL` | Recommended | — | Public URL — shown in agent password setup guides |
| `PORT` | No | `3000` | HTTP listen port |
| `IMAP_HOST` / `SMTP_HOST` | No | — | Single default account from env |

> Copy `.env.example` to `.env` and fill in your values.

### Config loading order

```
IMAP_HOST / SMTP_HOST  →  always loaded as the "default" account
DATABASE_URL           →  additionally loads more accounts from Postgres
Neither set            →  startup error
```

---

## 📧 MCP Tools

<details>
<summary><strong>Read & Search</strong></summary>

| Tool | Description |
|---|---|
| `list_emails` | List emails with optional filters (unread, limit) |
| `get_email` | Fetch full email — text/html via BODYSTRUCTURE, attachment metadata from structure tree |
| `search_emails` | Search by from, to, subject, body, date range, flags |
| `get_thread` | Fetch full conversation thread by Message-ID |
| `get_attachments` | List attachment metadata or download with base64 content |
| `watch_inbox` | Watch for new emails via IMAP IDLE |

</details>

<details>
<summary><strong>Send & Compose</strong></summary>

| Tool | Description |
|---|---|
| `send_email` | Send immediately via SMTP or HTTP transport |
| `reply_email` | Reply to a message — auto-fills In-Reply-To / References |
| `reply_all_email` | Reply-all, excluding self from recipients |
| `forward_email` | Forward with original body quoted |
| `save_draft` | Save to Drafts folder |
| `send_calendar_invite` | Send iCal VEVENT with RSVP |

</details>

<details>
<summary><strong>Bulk & Templates</strong></summary>

| Tool | Description |
|---|---|
| `bulk_send` | Send personalised emails to a list with per-row variable substitution |
| `bulk_send_calendar_invite` | Send individual calendar invites to a list |
| `define_template` | Define a reusable email template with variables |
| `list_templates` | List defined templates |
| `preview_template` | Preview a template with sample data |
| `send_template` | Send using a defined template |

</details>

<details>
<summary><strong>Queue</strong></summary>

| Tool | Description |
|---|---|
| `queue_email` | Enqueue for async delivery with retries and priority |
| `queue_stats` | View queue depth and processing stats |
| `queue_pause` / `queue_resume` | Pause or resume the queue |
| `queue_drain` | Wait for queue to empty |
| `queue_cancel` | Cancel a queued message |
| `list_dead_letters` | List permanently failed messages |
| `retry_dead_letter` | Retry a dead-lettered message |

</details>

<details>
<summary><strong>Flags & Organisation</strong></summary>

| Tool | Description |
|---|---|
| `mark_emails` | Set/clear seen, flagged, answered |
| `move_emails` | Move to another mailbox (IMAP MOVE or COPY+DELETE) |
| `copy_emails` | Copy to another mailbox |
| `delete_emails` | Permanently delete (mark + EXPUNGE) |
| `sync_incremental` | Fetch messages changed since a CONDSTORE mod-sequence |

</details>

<details>
<summary><strong>Mailboxes</strong></summary>

| Tool | Description |
|---|---|
| `list_mailboxes` | List all IMAP folders |
| `get_mailbox_status` | Message counts and sync metadata |
| `create_mailbox` | Create a new folder |
| `rename_mailbox` | Rename a folder |
| `delete_mailbox` | Delete a folder |

</details>

<details>
<summary><strong>Accounts</strong></summary>

| Tool | Description |
|---|---|
| `list_accounts` | List accounts with default status and capabilities |
| `add_account` | Add account to DB — returns curl command for password setup |
| `update_account` | Update host, port, user, label |
| `remove_account` | Remove account from DB |
| `set_default_account` | Switch the default account |
| `reload_config` | Reload accounts without restarting |
| `health_check` | Live IMAP/SMTP connectivity probe |

</details>

---

## 🔑 Secure Password Flow

Passwords **never** pass through the agent. The agent guides you to set them directly:

```
You: "Add my work Gmail, imap.gmail.com, work@company.com"

Agent: Account "work" saved. Set your credentials:

  curl -X POST https://your-server/accounts/work/password \
    -H "Authorization: Bearer <your MAIL_MCP_SECRET value>" \
    -H "Content-Type: application/json" \
    -d '{"imap_pass":"your-app-password","smtp_pass":"your-app-password"}'

  Credentials are encrypted at rest. Account activates immediately.
```

---

## 🌐 HTTP Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Server health check |
| `GET` | `/accounts` | `API_KEYS` | List accounts (no passwords) |
| `PATCH` | `/accounts/:name` | `API_KEYS` | Update non-sensitive fields |
| `DELETE` | `/accounts/:name` | `API_KEYS` | Remove an account |
| `POST` | `/accounts/:name/password` | `MAIL_MCP_SECRET` | Set encrypted credentials |

> The password endpoint deliberately uses `MAIL_MCP_SECRET` — not `API_KEYS` — so the agent (which knows `API_KEYS`) is cryptographically prevented from setting credentials.

---

## 🚢 Deployment

### Docker

```bash
docker build -t mail-mcp .
docker run -p 3000:3000 --env-file .env mail-mcp
```

### Cloud Run (GCP)

```bash
gcloud run deploy mail-mcp \
  --image gcr.io/YOUR_PROJECT/mail-mcp \
  --region us-central1 \
  --allow-unauthenticated \
  --update-secrets="DATABASE_URL=DATABASE_URL:latest,API_KEYS=API_KEYS:latest,MAIL_MCP_SECRET=MAIL_MCP_SECRET:latest" \
  --set-env-vars="SERVER_URL=https://your-service-url"
```

See [`deploy/`](deploy/) for Fly.io, Azure Container Apps, and AWS App Runner guides.

### CI/CD

Two workflows:

**`ci.yml`** — runs automatically on every push to `main` and every PR:
- Typecheck → Build → Test → Security audit (parallel)

**`deploy.yml`** — triggered manually from GitHub Actions → Run workflow:
- Leave version empty → reads version from `package.json`, creates git tag, deploys
- Enter version (e.g. `v0.1.0`) → rollback to that existing tag's original commit
- Source code on `main` is never modified by deploys or rollbacks

Two separate approval gates:

| Gate | Environment | Action |
|---|---|---|
| 1 | `tag` | Create / validate the release tag |
| 2 | `production` | Build image and deploy to Cloud Run |

Required GitHub secrets:
```
GCP_PROJECT_ID · GCP_REGION · GCP_WORKLOAD_IDENTITY_PROVIDER · GCP_SERVICE_ACCOUNT · SERVER_URL
```

GCP Secret Manager secrets: `DATABASE_URL`, `API_KEYS`, `MAIL_MCP_SECRET`

> Set up both environments in **GitHub → Settings → Environments** with required reviewers.

---

## 🛠️ Development

```bash
git clone https://github.com/anishhs-gh/mail-mcp
cd mail-mcp
npm install
cp .env.example .env   # fill in your credentials
npm run dev            # hot reload on http://localhost:3000
npm test               # 22 unit tests
npm run build          # production build
```

---

## ⚡ Powered by @mailts/core

mail-mcp is built on top of <img src="https://mailts.anishhs.com/logo-icon.png" alt="mailts" width="12" /> **[@mailts/core](https://www.npmjs.com/package/@mailts/core)** — a modern, native TypeScript SMTP/IMAP library with zero legacy dependencies, built from the ground up for Node 18+.

What mailts brings to this MCP:

- **BODYSTRUCTURE parsing** — selective MIME section fetch means only text parts are downloaded when reading email; attachment bytes are never transferred unless explicitly requested
- **`ImapSession.search()`** — full IMAP SEARCH through the session lock, no raw client exposure
- **`textOnly` fetch mode** — BODYSTRUCTURE-driven, fetches text/plain and text/html only in a single round-trip
- **Native TLS, DKIM, OAuth2, IDLE** — zero legacy dependencies, built for Node 18+
- **SMTP queue with priority scheduling** — built-in retry logic, dead-letter handling, and external queue driver support

> mailts is also open source — check it out at [github.com/anishhs-gh/mailts](https://github.com/anishhs-gh/mailts)

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) first.

---

## 📄 License

[MIT](LICENSE) © 2026 [Anish Shekh](https://anishhs.com)

---

<div align="center">

**Built by [Anish Shekh](https://anishhs.com)**

[![GitHub](https://img.shields.io/badge/GitHub-anishhs--gh-181717?logo=github)](https://github.com/anishhs-gh)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-anishsh-0A66C2?logo=linkedin)](https://linkedin.com/in/anishsh)
[![Website](https://img.shields.io/badge/Website-anishhs.com-FF6B6B)](https://anishhs.com)

</div>

