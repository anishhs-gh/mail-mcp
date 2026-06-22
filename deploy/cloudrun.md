# Deploy to GCP Cloud Run

Scales to zero — effectively free for personal use (2M requests/month free tier).

## Prerequisites

- `gcloud` CLI installed and authenticated
- GCP project created with billing enabled

## 1. Set environment variables

```bash
export PROJECT_ID=your-project-id
export REGION=us-central1
export SERVICE=mail-mcp
gcloud config set project $PROJECT_ID
```

## 2. Enable required APIs

```bash
gcloud services enable run.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com
```

## 3. Store secrets in Secret Manager

```bash
# Required
echo -n "postgresql://user:pass@host/db?sslmode=require" \
  | gcloud secrets create DATABASE_URL --data-file=-

echo -n "$(openssl rand -hex 32)" \
  | gcloud secrets create API_KEYS --data-file=-

echo -n "$(openssl rand -hex 32)" \
  | gcloud secrets create MAIL_MCP_SECRET --data-file=-

# Your public Cloud Run URL (update after first deploy)
echo -n "https://mail-mcp-xxxx-uc.a.run.app" \
  | gcloud secrets create SERVER_URL --data-file=-

# Optional: default account from env
echo -n "imap.gmail.com" | gcloud secrets create IMAP_HOST --data-file=-
echo -n "you@gmail.com"  | gcloud secrets create IMAP_USER --data-file=-
echo -n "your-app-pass"  | gcloud secrets create IMAP_PASS --data-file=-
echo -n "smtp.gmail.com" | gcloud secrets create SMTP_HOST --data-file=-
echo -n "you@gmail.com"  | gcloud secrets create SMTP_USER --data-file=-
echo -n "your-app-pass"  | gcloud secrets create SMTP_PASS --data-file=-
```

## 4. Build and push

```bash
gcloud builds submit \
  --tag gcr.io/$PROJECT_ID/$SERVICE:latest \
  --project $PROJECT_ID
```

## 5. Deploy

```bash
gcloud run deploy $SERVICE \
  --image gcr.io/$PROJECT_ID/$SERVICE:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --memory 256Mi \
  --update-secrets="DATABASE_URL=DATABASE_URL:latest,API_KEYS=API_KEYS:latest,MAIL_MCP_SECRET=MAIL_MCP_SECRET:latest,SERVER_URL=SERVER_URL:latest"
```

`--allow-unauthenticated` is safe — the MCP endpoint is protected by `API_KEYS`.

## 6. Get the URL and update SERVER_URL

```bash
URL=$(gcloud run services describe $SERVICE --region $REGION --format "value(status.url)")
echo "Service URL: $URL"

# Update SERVER_URL secret with the real URL
echo -n "$URL" | gcloud secrets versions add SERVER_URL --data-file=-
```

## 7. Add accounts

Use the agent to add accounts (host/user/port only), then set passwords directly:

```bash
curl -X POST $URL/accounts/personal/password \
  -H "Authorization: Bearer <MAIL_MCP_SECRET value>" \
  -H "Content-Type: application/json" \
  -d '{"imap_pass":"your-app-password","smtp_pass":"your-app-password"}'
```

## 8. Connect Claude

```json
{
  "mcpServers": {
    "mail": {
      "type": "http",
      "url": "https://mail-mcp-xxxx-uc.a.run.app/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEYS_VALUE" }
    }
  }
}
```

## CI/CD

Two workflows are included:

**`ci.yml`** — runs automatically on push to `main` and PRs (typecheck, build, test, audit).

**`deploy.yml`** — manually triggered from GitHub Actions → Run workflow:

| Input | Behaviour |
|---|---|
| *(empty)* | Reads version from `package.json`, creates git tag at HEAD, deploys |
| `v0.1.0` | Rollback — checks out that tag's original commit, redeploys it |

Two separate approval gates — set both up in **GitHub → Settings → Environments → Required reviewers**:
- **`tag`** — approves tag creation / validation
- **`production`** — approves the actual build and deploy

Required GitHub secrets:
```
GCP_PROJECT_ID
GCP_REGION
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_SERVICE_ACCOUNT
SERVER_URL
```

## Cost estimate

Personal/light use: **$0/month** under the free tier.
