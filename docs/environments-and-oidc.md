# Environments, approvals and OIDC setup

`deploy.yml` is complete but intentionally not wired to a real cloud account in this
portfolio repository. These are the one-time steps to make it live in a real project.

## 1. GitHub Environments (replaces Jenkins `input`)

Repository **Settings > Environments**:

| Setting | `staging` | `production` |
| --- | --- | --- |
| Required reviewers | none (or 1 for regulated teams) | **2 reviewers** from `@org/release-managers` |
| Prevent self-review | - | **enabled** (the person who triggered cannot approve) |
| Wait timer | 0 | optional, e.g. 5 minutes |
| Deployment branches and tags | `main` only | `main` only |
| Variables | `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AKS_RESOURCE_GROUP`, `AKS_CLUSTER_NAME` | same keys, production values |

Or as code with the GitHub CLI:

```bash
gh api -X PUT "repos/OWNER/REPO/environments/production" --input - <<'JSON'
{
  "wait_timer": 5,
  "prevent_self_review": true,
  "reviewers": [{ "type": "Team", "id": 1234567 }],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
gh api -X POST "repos/OWNER/REPO/environments/production/deployment-branch-policies" -f name=main -f type=branch
gh variable set AZURE_CLIENT_ID --env production --body "<app-registration-client-id>"
```

Why this is better than `input`: the approval is attached to a deployment record with the
approver's identity and timestamp, no runner is held while waiting, and the rules live in
repository settings governed by admins rather than in pipeline code anyone can edit.

## 2. Azure: federated credential instead of a client secret

```bash
APP_ID=$(az ad app create --display-name gh-versioning-service-deploy --query appId -o tsv)
az ad sp create --id "$APP_ID"

# One federated credential per environment. The subject pins repo AND environment,
# so a workflow on a feature branch or in a fork can never obtain this identity.
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:OWNER/REPO:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'

# Least privilege: deploy rights on one cluster only.
AKS_ID=$(az aks show -g rg-apps-prod -n aks-apps-prod --query id -o tsv)
az role assignment create --assignee "$APP_ID" \
  --role "Azure Kubernetes Service Cluster User Role" --scope "$AKS_ID"
# Plus a namespace-scoped Kubernetes RoleBinding (or Azure RBAC for Kubernetes) for "versioning".
```

There is **no secret to store, rotate or leak**. Tokens are minted per job and expire within
minutes.

## 3. AWS equivalent

```yaml
permissions:
  id-token: write
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@<sha> # pin by SHA
    with:
      role-to-assume: arn:aws:iam::123456789012:role/gh-versioning-service-deploy
      aws-region: eu-west-1
```

IAM role trust policy condition: `token.actions.githubusercontent.com:sub` equals
`repo:OWNER/REPO:environment:production` and `aud` equals `sts.amazonaws.com`.

## 4. Branch protection / rulesets

- Require pull requests to `main`, at least one approval, CODEOWNERS review for `.github/`.
- Required status checks: `lint (code, Dockerfile, workflows)`, `test (node 22.23.3)`,
  `test (node 24.21.0)`, `validate legacy Jenkinsfile`, `parity (Jenkins vs GitHub Actions)`,
  `image (build and scan) / build, scan`.
- Block force pushes; require linear history.
- Organisation level: allow only GitHub-authored, verified-creator and explicitly listed
  actions, and require SHA pinning.
