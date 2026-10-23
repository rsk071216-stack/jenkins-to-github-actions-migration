# Jenkins to GitHub Actions concept mapping

A reference table I use in migration workshops. Left column: what your teams write today.
Right column: the idiomatic GitHub Actions equivalent, with the place it is demonstrated in this
repository.

## Pipeline structure

| Jenkins | GitHub Actions | Notes / where in this repo |
| --- | --- | --- |
| `Jenkinsfile` (declarative `pipeline {}`) | Workflow file in `.github/workflows/*.yml` | [`ci.yml`](../.github/workflows/ci.yml), [`deploy.yml`](../.github/workflows/deploy.yml) |
| `stage('X') { steps {...} }` | `jobs.<id>` (unit of scheduling) or a named `step` | Jenkins stages that share a workspace usually become *steps* of one job; stages that need isolation or a different machine become *jobs* |
| `steps { sh '...' }` | `- run: ...` | Default shell is `bash -e`; add `set -euo pipefail` for multi-line scripts |
| `agent any` / `agent { label 'linux' }` | `runs-on: ubuntu-24.04` (pin the image, avoid `-latest`) | Every job runs on a fresh VM. Self-hosted or larger runners via labels/groups |
| `agent { docker { image 'node:22' } }` | `container: node:22.x` at job level, or a `setup-*` action | This repo uses `actions/setup-node` with an exact version; the parity job replays the Jenkins Docker agent |
| `agent none` + per-stage agents | Separate jobs, each with its own `runs-on` | `needs:` builds the dependency graph |
| `options { timeout(...) }` | `timeout-minutes:` (job or step) | Set on every job in this repo |
| `options { disableConcurrentBuilds() }` | `concurrency: { group, cancel-in-progress }` | [`ci.yml`](../.github/workflows/ci.yml) cancels superseded PR runs only |
| `options { buildDiscarder(...) }` | `retention-days:` on artifacts, repository retention setting | |
| `options { timestamps() }`, `ansiColor` | Built in | Two plugins fewer |
| `parameters { booleanParam / choice / string }` | `on.workflow_dispatch.inputs` (`boolean`, `choice`, `string`, `environment`) | [`deploy.yml`](../.github/workflows/deploy.yml) `digest` + `target` inputs |
| `environment { FOO = 'bar' }` | `env:` at workflow, job or step level | |
| `when { branch 'main' }` | `if: github.ref == 'refs/heads/main'` | Job-level `if` skips the whole job |
| `when { expression { ... } }` | `if: ${{ <expression> }}` | Expressions, functions like `contains()`, `startsWith()` |
| `when { changeset 'src/**' }` | `on.push.paths` / `paths-ignore`, or `dorny/paths-filter` for per-job decisions | |
| `parallel { stage(...) stage(...) }` | Independent jobs (run in parallel by default) or `strategy.matrix` | `test` job matrix over Node 22 and 24 |
| `matrix { axes { ... } }` | `strategy.matrix` with `include` / `exclude` | `fail-fast: false` to see every failure |
| `post { always { } }` | `if: always()` on a step or job | Test-report upload in [`node-test`](../.github/actions/node-test/action.yml) |
| `post { failure { } }` | `if: failure()` | Automatic `kubectl rollout undo` in `deploy.yml` |
| `post { success { } }` | `if: success()` (default) | |
| `post { cleanup { cleanWs() } }` | Not needed: hosted runners are discarded after every job | One plugin fewer |
| `retry(3) { ... }` | Retry inside the script, or a retry action; prefer fixing flakiness | |
| `input message: 'Deploy?'` | `environment:` with **required reviewers** | Waits without holding a runner; approver identity is audited. See [environments-and-oidc.md](environments-and-oidc.md) |
| `milestone()` / `lock()` (Lockable Resources) | `concurrency:` groups (per environment) | `deploy.yml` uses `concurrency` with `cancel-in-progress: false` |

## Triggers

| Jenkins | GitHub Actions | Notes |
| --- | --- | --- |
| `pollSCM('H/5 * * * *')` | `on: push` / `on: pull_request` (webhooks) | Removes up to 5 minutes of lead time per change and the polling load |
| `cron('H 2 * * 1-5')` | `on.schedule: - cron: '0 2 * * 1-5'` | UTC only; no `H` hash token, so spread schedules manually |
| GitHub Branch Source / Multibranch | Native: workflows run for every branch and PR | Branch discovery is free |
| `upstream(upstreamProjects: 'a')` / `build job: 'b'` | `workflow_run`, `repository_dispatch`, or `workflow_call` (reusable) | Prefer `workflow_call` for composition |
| Generic Webhook Trigger plugin | `repository_dispatch` / `workflow_dispatch` via API | |

## Data between stages and jobs

| Jenkins | GitHub Actions | Notes |
| --- | --- | --- |
| Shared workspace between stages | Steps in the same job share the workspace | |
| `stash` / `unstash` | `actions/upload-artifact` / `actions/download-artifact` | Parity job downloads the test reports produced by the `test` job |
| `archiveArtifacts` | `actions/upload-artifact` with `retention-days` | |
| `junit 'reports/*.xml'` | Upload JUnit as an artifact + job summary; or a test-reporter action | `$GITHUB_STEP_SUMMARY` gives a rich Markdown report per job |
| `env.FOO = sh(returnStdout: true)` | `echo "foo=..." >> "$GITHUB_OUTPUT"` then `steps.<id>.outputs.foo` | Job outputs via `jobs.<id>.outputs` |
| `currentBuild.result`, `currentBuild.description` | `job.status`, step summary | |
| Docker layer cache on a long-lived agent | `cache-from/cache-to: type=gha` (Buildx) and `actions/cache` | Ephemeral runners need an explicit cache |

## Credentials and security

| Jenkins | GitHub Actions | Notes |
| --- | --- | --- |
| `credentials('id')` / `withCredentials([...])` for **cloud** access | **OIDC federation** (`id-token: write` + `azure/login`, `aws-actions/configure-aws-credentials`, `google-github-actions/auth`) | No secret stored at all; tokens live for minutes and are bound to repo + environment. [ADR 0004](adr/0004-oidc-over-stored-credentials.md) |
| `usernamePassword` for the container registry | `GITHUB_TOKEN` for GHCR; OIDC for ACR/ECR/GAR | `GITHUB_TOKEN` is minted per job and expires when the job ends |
| Credentials for third-party SaaS (Sonar, Slack) | `secrets.*` scoped to an **environment** where possible | Secrets are masked in logs and never exposed to fork PRs |
| Folder-scoped credentials | Environment secrets/variables, organisation secrets with repository access lists | |
| Role-based Authorization Strategy plugin | Repository roles, CODEOWNERS, rulesets, environment protection rules | |
| Script approval / sandbox | Workflow `permissions:` (least privilege per job), pinned actions, `actionlint` | Default token is read-only in this repo |
| Plugin updates | Actions pinned by **commit SHA**, updated by Dependabot with a cooldown | [`dependabot.yml`](../.github/dependabot.yml) |

## Reuse

| Jenkins | GitHub Actions | When to use |
| --- | --- | --- |
| Shared library `vars/step.groovy` that wraps a few `sh` steps | **Composite action** (`.github/actions/<name>/action.yml`) | Reuse a sequence of *steps* inside the caller's job. Example: [`node-test`](../.github/actions/node-test/action.yml) replaces `vars/nodeBuild.groovy` |
| Shared library "pipeline template" (`vars/standardPipeline.groovy`) | **Reusable workflow** (`on: workflow_call`) | Reuse whole *jobs* including `runs-on`, permissions and environments. Example: [`reusable-container-build.yml`](../.github/workflows/reusable-container-build.yml) replaces `vars/dockerBuildPush.groovy` |
| `@Library('lib@master')` | `uses: org/repo/.github/workflows/x.yml@v1.2.0` (or `@<sha>`) | Consumers pin a version; breaking changes ship as a new major tag |
| Shared library `src/` Groovy classes | A JavaScript or container action with its own tests and releases | Only when logic is too complex for shell |
| Job DSL / seed jobs | Not needed: workflows live in each repository; use starter workflows and rulesets for governance | Required workflows via organisation rulesets |

## Platform and operations

| Jenkins | GitHub Actions |
| --- | --- |
| Controller HA, backups, JVM tuning, plugin compatibility matrix | Managed service (GitHub-hosted runners) |
| Static agents / cloud agents plugin | GitHub-hosted runners, larger runners, or Actions Runner Controller (ARC) on Kubernetes for self-hosted |
| Build history on controller disk | Run history, logs and artifacts with retention policies; audit log streaming |
| Blue Ocean / stage view | Workflow run graph, job summaries |
| Jenkins CLI / REST API | `gh run`, `gh workflow`, REST/GraphQL APIs |
