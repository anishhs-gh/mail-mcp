# Deploy to Fly.io

~$2–3/month for a shared-cpu-1x 256MB machine. Always-on, no cold starts.

## Prerequisites

- `flyctl` installed: `brew install flyctl`
- `flyctl auth login`

## 1. Initialize

```bash
fly launch --name mail-mcp --no-deploy
```

Edit the generated `fly.toml`:

```toml
[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

## 2. Set secrets

Fly secrets are injected as environment variables at runtime.

```bash
fly secrets set \
  DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
  API_KEYS="$(openssl rand -hex 32)" \
  MAIL_MCP_SECRET="$(openssl rand -hex 32)" \
  SERVER_URL="https://mail-mcp.fly.dev"

# Optional: default account from env
fly secrets set \
  IMAP_HOST="imap.gmail.com" \
  IMAP_USER="you@gmail.com" \
  IMAP_PASS="your-app-password" \
  SMTP_HOST="smtp.gmail.com" \
  SMTP_USER="you@gmail.com" \
  SMTP_PASS="your-app-password"
```

## 3. Deploy

```bash
fly deploy
```

## 4. Add accounts

Use the agent to add accounts, then set passwords directly:

```bash
curl -X POST https://mail-mcp.fly.dev/accounts/personal/password \
  -H "Authorization: Bearer <MAIL_MCP_SECRET value>" \
  -H "Content-Type: application/json" \
  -d '{"imap_pass":"your-app-password","smtp_pass":"your-app-password"}'
```

## 5. Connect Claude

```json
{
  "mcpServers": {
    "mail": {
      "type": "http",
      "url": "https://mail-mcp.fly.dev/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEYS_VALUE" }
    }
  }
}
```
