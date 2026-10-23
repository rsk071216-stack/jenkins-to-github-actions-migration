# Before vs. after metrics

> **Illustrative numbers.** This repository is a demonstration. The "Jenkins" column is a
> representative baseline from estates of this shape (self-managed controller, static Docker
> agents, SCM polling); the "GitHub Actions" column is the target profile the migrated
> pipeline is designed for. They are **not** measurements of a specific customer. In an
> engagement both columns are measured from real data (see the success metrics in the
> [migration playbook](migration-playbook.md#success-metrics)).

| Metric | Jenkins (before) | GitHub Actions (after) | Why it changes |
| --- | --- | --- | --- |
| Time from push to pipeline start | 0-5 min (SCM polling) + queue wait | Seconds (webhook, hosted runner) | `pollSCM` replaced by `push`/`pull_request` events |
| Pipeline duration, PR (p50) | ~14 min | ~5 min | Independent jobs run in parallel; Buildx layer cache in the GHA cache; no Sonar quality-gate wait holding an executor |
| Pipeline duration, main incl. push/sign/attest (p50) | ~18 min | ~7 min | Same, plus no agent provisioning |
| Executor/runner queue time (p95) | 6-12 min at peak | < 30 s | Elastic hosted runners instead of a fixed agent pool |
| Manual approval holding compute | Yes (`input` inside a stage) | No | Environment reviewers wait without a runner |
| Long-lived credentials in CI | 4 (`azure-sp-prod`, `acr-push`, `sonar-token`, `slack-token`) | 0 cloud/registry secrets | OIDC to Azure, `GITHUB_TOKEN` for GHCR |
| Plugins / actions to maintain | 14 direct + ~90 transitive plugins | 19 actions, SHA-pinned, Dependabot-managed | No controller, no plugin compatibility matrix |
| Supply-chain evidence per image | None | SBOM, vulnerability gate, cosign signature, SBOM attestation, SLSA provenance | Built into the reusable workflow |
| Deploy-time verification | None | Signature + provenance verified before every deploy | `verify` job in `deploy.yml` |
| Platform toil (hours/month) | 20-40 (upgrades, agents, disk, plugins) | 2-4 (template updates, Dependabot PRs) | Managed service |
| Rollback | Manual runbook | Automatic `rollout undo` on failed rollout; redeploy previous digest | Immutable digests + `if: failure()` |
| Cost model | Controller + agent VMs 24/7 + people time | Per-minute runner usage; free for public repositories | Pay per use |

## What CI in this repository actually measures

These are facts you can verify in the Actions tab, unlike the table above:

- Every run publishes a **parity report** (job summary + `parity-report` artifact) comparing
  the Jenkins replay and the GitHub Actions path.
- Every run publishes **coverage** per Node.js version in the job summary.
- Every `main` run publishes a **container build** summary with the image digest and the exact
  `cosign verify` / `gh attestation verify` commands.
- Run durations are visible per job in the workflow run graph.
