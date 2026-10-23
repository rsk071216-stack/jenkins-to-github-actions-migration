# ADR 0004: OIDC federation instead of stored cloud credentials

- Status: accepted
- Date: 2026-10-23

## Context

The legacy pipeline authenticates to Azure with a service principal client secret
(`azure-sp-prod`) stored in Jenkins. The same secret is used for staging and production,
is rotated manually, and is available to any job on the controller that knows its ID.

## Decision

- Cloud access from GitHub Actions uses **OpenID Connect**: the job requests a token from
  GitHub (`permissions: id-token: write`), and Entra ID exchanges it for an access token
  through a **federated credential** whose subject is pinned to
  `repo:OWNER/REPO:environment:<name>`.
- One app registration per environment, each with least-privilege role assignments on one
  cluster.
- Identifiers (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`) are stored as
  environment **variables**, not secrets: they are not sensitive on their own.
- Registry access to GHCR uses the per-job `GITHUB_TOKEN`; for ACR/ECR the same OIDC login
  is reused (`az acr login`, `aws ecr get-login-password`).
- `id-token: write` is granted only on jobs that need it, never at workflow level.

## Consequences

- No credential to rotate, leak or revoke at decommission time for the migrated services.
- A workflow on a feature branch or a fork cannot assume the production identity, because the
  token subject would not match.
- Third-party SaaS without OIDC support (for example some notification or quality tools)
  still need secrets; those are scoped to environments and listed in the inventory.
