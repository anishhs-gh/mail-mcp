# Deploy to Azure Container Apps

180K vCPU-seconds free per month, scales to zero.

## Prerequisites

- Azure CLI (`az`) installed and logged in
- Docker installed

## 1. Create resource group and registry

```bash
export RESOURCE_GROUP=mail-mcp-rg
export LOCATION=eastus
export ACR_NAME=mailmcpregistry
export APP_NAME=mail-mcp

az group create --name $RESOURCE_GROUP --location $LOCATION
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic
az acr login --name $ACR_NAME
```

## 2. Build and push

```bash
docker build -t $ACR_NAME.azurecr.io/mail-mcp:latest .
docker push $ACR_NAME.azurecr.io/mail-mcp:latest
```

## 3. Store credentials in Azure Key Vault

```bash
export KV_NAME=mail-mcp-kv

az keyvault create \
  --name $KV_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION

az keyvault secret set --vault-name $KV_NAME --name DATABASE-URL \
  --value "postgresql://user:pass@host/db?sslmode=require"
az keyvault secret set --vault-name $KV_NAME --name API-KEYS \
  --value "$(openssl rand -hex 32)"
az keyvault secret set --vault-name $KV_NAME --name MAIL-MCP-SECRET \
  --value "$(openssl rand -hex 32)"
az keyvault secret set --vault-name $KV_NAME --name SERVER-URL \
  --value "https://mail-mcp.your-env.eastus.azurecontainerapps.io"
```

## 4. Create Container App Environment

```bash
az containerapp env create \
  --name mail-mcp-env \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION
```

## 5. Deploy

```bash
az containerapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment mail-mcp-env \
  --image $ACR_NAME.azurecr.io/mail-mcp:latest \
  --registry-server $ACR_NAME.azurecr.io \
  --target-port 3000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 2 \
  --cpu 0.25 --memory 0.5Gi \
  --secrets \
      "db-url=keyvaultref:https://$KV_NAME.vault.azure.net/secrets/DATABASE-URL,identityref:system" \
      "api-keys=keyvaultref:https://$KV_NAME.vault.azure.net/secrets/API-KEYS,identityref:system" \
      "mcp-secret=keyvaultref:https://$KV_NAME.vault.azure.net/secrets/MAIL-MCP-SECRET,identityref:system" \
      "server-url=keyvaultref:https://$KV_NAME.vault.azure.net/secrets/SERVER-URL,identityref:system" \
  --env-vars \
      "DATABASE_URL=secretref:db-url" \
      "API_KEYS=secretref:api-keys" \
      "MAIL_MCP_SECRET=secretref:mcp-secret" \
      "SERVER_URL=secretref:server-url"
```

## 6. Add accounts

Use the agent to add accounts, then set passwords directly:

```bash
curl -X POST https://mail-mcp.your-env.eastus.azurecontainerapps.io/accounts/personal/password \
  -H "Authorization: Bearer <MAIL_MCP_SECRET value>" \
  -H "Content-Type: application/json" \
  -d '{"imap_pass":"your-app-password","smtp_pass":"your-app-password"}'
```

## 7. Connect Claude

```json
{
  "mcpServers": {
    "mail": {
      "type": "http",
      "url": "https://mail-mcp.your-env.eastus.azurecontainerapps.io/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEYS_VALUE" }
    }
  }
}
```
