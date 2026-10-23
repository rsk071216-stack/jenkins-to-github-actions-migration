# Inventory and assessment

How I build a defensible picture of a Jenkins estate in the first week of an engagement.

## 1. The inventory template

[`jenkins-inventory-template.csv`](jenkins-inventory-template.csv) has one row per Jenkins job
(multibranch pipelines: one row per main branch). It opens in Excel or Google Sheets and is the
backbone of the wave plan. Four example rows show the common dispositions.

| Column | Why it matters |
| --- | --- |
| `last_success_utc`, `builds_last_90d` | Finds dead jobs. Retiring is the cheapest migration. |
| `triggers` | `pollSCM` becomes webhooks; `cron` needs UTC conversion (no `H` token). |
| `agent_labels`, `docker_agent_image` | Decides GitHub-hosted vs. self-hosted (ARC) runners. |
| `credentials_used` | Every row here needs a replacement plan: OIDC, `GITHUB_TOKEN`, environment secret, or delete. |
| `plugins_beyond_core` | Plugins without an Actions equivalent drive the complexity score. |
| `shared_library_steps` | Becomes composite actions / reusable workflows; build these first. |
| `manual_approvals` | Becomes environment protection rules with required reviewers. |
| `network_dependencies` | Private endpoints are the most common blocker for hosted runners. |
| `importer_audit_result` | Output of `gh actions-importer audit` for that job. |
| `complexity_1to5` | 1 = importer output works as-is, 5 = redesign. Drives effort estimates. |
| `disposition` | `migrate`, `retire`, `rewrite`, or `keep` (rare, needs a reason). |

Collecting the raw data from Jenkins (script console or API, read-only):

```bash
# All jobs with their class and last successful build (Jenkins REST API, read-only token)
curl -s -u "$JENKINS_USER:$JENKINS_API_TOKEN" \
  "$JENKINS_URL/api/json?tree=jobs[fullName,_class,lastSuccessfulBuild[timestamp,duration],jobs[fullName,_class,lastSuccessfulBuild[timestamp,duration]]]" \
  | jq -r '.. | objects | select(.fullName?) | [.fullName, ._class, (.lastSuccessfulBuild.timestamp // "" | tostring)] | @csv'

# Installed plugins and versions
curl -s -u "$JENKINS_USER:$JENKINS_API_TOKEN" "$JENKINS_URL/pluginManager/api/json?depth=1&tree=plugins[shortName,version]" \
  | jq -r '.plugins[] | "\(.shortName):\(.version)"' | sort
```

## 2. GitHub Actions Importer

[GitHub Actions Importer](https://docs.github.com/en/actions/migrating-to-github-actions/using-github-actions-importer-to-automate-migrations/automating-migration-with-github-actions-importer)
is GitHub's official CLI extension for planning and automating migrations. It runs as a
container, so it needs Docker on the machine that runs it (a jump host or a Codespace, not
necessarily a laptop).

```bash
gh extension install github/gh-actions-importer
gh actions-importer update          # pulls the latest importer container image
gh actions-importer configure       # interactive: Jenkins URL, user, API token, GitHub token
```

Credentials can also be supplied as environment variables (`GITHUB_ACCESS_TOKEN`,
`GITHUB_INSTANCE_URL`, `JENKINS_ACCESS_TOKEN`, `JENKINS_USERNAME`, `JENKINS_INSTANCE_URL`).
Use a **read-only** Jenkins token.

### Audit - estate-wide readiness report

```bash
gh actions-importer audit jenkins --output-dir tmp/audit
```

Produces `audit_summary.md` with: share of pipelines that convert fully / partially /
not at all, the list of **unsupported build steps and plugins** ranked by frequency, the
**secrets** referenced, and **self-hosted runner** labels. That ranking tells you which
custom transformers or composite actions to build first.

### Forecast - runner usage

```bash
gh actions-importer forecast jenkins --output-dir tmp/forecast
```

Estimates job counts, execution and queue times from build history; it feeds the cost model
and the runner sizing decision.

### Dry run - convert one job without touching GitHub

```bash
gh actions-importer dry-run jenkins \
  --source-url "$JENKINS_URL/job/platform/job/versioning-service/" \
  --output-dir tmp/dry-run
```

Writes the converted workflow YAML locally. Treat it as a **first draft**: it does not pin
actions by SHA, rarely sets least-privilege `permissions`, and converts credentials to
`secrets.*` rather than OIDC. The hand-finished result for this repository is
[`ci.yml`](../../.github/workflows/ci.yml).

### Custom transformers - teach the importer your plugins and shared library

Sketch only - inspect the `item` structure for your own steps with a dry run first, as it
depends on how the step is called:

```ruby
# transformers.rb - map an in-house shared library step to a composite action
transform "deployToAks" do |item|
  {
    "name" => "Deploy (migrated from deployToAks)",
    "uses" => "./.github/actions/deploy-aks",
    "with" => { "environment" => item["arguments"][0]["value"] }
  }
end
```

```bash
gh actions-importer dry-run jenkins --source-url "$JOB_URL" --output-dir tmp/dry-run \
  --custom-transformers transformers.rb
```

### Migrate - open a pull request with the converted workflow

```bash
gh actions-importer migrate jenkins \
  --source-url "$JENKINS_URL/job/platform/job/versioning-service/" \
  --target-url https://github.com/acme/versioning-service \
  --output-dir tmp/migrate
```

The importer opens a PR in the target repository. I review it against the hardening
checklist below before merge.

## 3. Hardening checklist applied to every converted workflow

- [ ] Third-party actions pinned by commit SHA with a version comment
- [ ] Workflow-level `permissions: contents: read`; elevated permissions only on the job that needs them
- [ ] No cloud credentials in secrets: OIDC federation instead
- [ ] `timeout-minutes` on every job; `concurrency` where runs can overlap
- [ ] Deployments through environments with required reviewers and branch policies
- [ ] `actionlint` passes; `persist-credentials: false` on checkout unless needed
- [ ] Shared logic moved into a versioned composite action or reusable workflow
- [ ] Parity check green for the agreed number of runs before cut-over
