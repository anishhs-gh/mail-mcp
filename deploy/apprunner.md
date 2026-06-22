# Deploy to AWS App Runner

Pay-per-vCPU-second, scales to zero, no cluster management.

## Prerequisites

- AWS CLI configured (`aws configure`)
- Docker installed

## 1. Push image to ECR

```bash
export AWS_REGION=us-east-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/mail-mcp

aws ecr create-repository --repository-name mail-mcp --region $AWS_REGION

aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin \
      $ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

docker build -t mail-mcp .
docker tag mail-mcp:latest $ECR_REPO:latest
docker push $ECR_REPO:latest
```

## 2. Store credentials in Secrets Manager

```bash
aws secretsmanager create-secret --name prod/mail-mcp/DATABASE_URL \
  --secret-string "postgresql://user:pass@host/db?sslmode=require"

aws secretsmanager create-secret --name prod/mail-mcp/API_KEYS \
  --secret-string "$(openssl rand -hex 32)"

aws secretsmanager create-secret --name prod/mail-mcp/MAIL_MCP_SECRET \
  --secret-string "$(openssl rand -hex 32)"

aws secretsmanager create-secret --name prod/mail-mcp/SERVER_URL \
  --secret-string "https://xxxx.us-east-1.awsapprunner.com"
```

## 3. Create IAM role for App Runner

App Runner needs permissions to pull from ECR and read Secrets Manager. Create a role with the following trust policy and attach `AmazonEC2ContainerRegistryReadOnly` + `SecretsManagerReadWrite` policies. See the [AWS App Runner docs](https://docs.aws.amazon.com/apprunner/latest/dg/security-iam-roles.html) for the trust policy JSON.

## 4. Deploy

```bash
aws apprunner create-service \
  --service-name mail-mcp \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "'$ECR_REPO':latest",
      "ImageRepositoryType": "ECR",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentSecrets": {
          "DATABASE_URL":    "arn:aws:secretsmanager:'$AWS_REGION':'$ACCOUNT_ID':secret:prod/mail-mcp/DATABASE_URL",
          "API_KEYS":        "arn:aws:secretsmanager:'$AWS_REGION':'$ACCOUNT_ID':secret:prod/mail-mcp/API_KEYS",
          "MAIL_MCP_SECRET": "arn:aws:secretsmanager:'$AWS_REGION':'$ACCOUNT_ID':secret:prod/mail-mcp/MAIL_MCP_SECRET",
          "SERVER_URL":      "arn:aws:secretsmanager:'$AWS_REGION':'$ACCOUNT_ID':secret:prod/mail-mcp/SERVER_URL"
        }
      }
    },
    "AutoDeploymentsEnabled": true
  }' \
  --instance-configuration '{"Cpu":"0.25 vCPU","Memory":"0.5 GB"}'
```

## 5. Add accounts

Use the agent to add accounts, then set passwords directly:

```bash
curl -X POST https://xxxx.us-east-1.awsapprunner.com/accounts/personal/password \
  -H "Authorization: Bearer <MAIL_MCP_SECRET value>" \
  -H "Content-Type: application/json" \
  -d '{"imap_pass":"your-app-password","smtp_pass":"your-app-password"}'
```

## 6. Connect Claude

```json
{
  "mcpServers": {
    "mail": {
      "type": "http",
      "url": "https://xxxx.us-east-1.awsapprunner.com/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEYS_VALUE" }
    }
  }
}
```
