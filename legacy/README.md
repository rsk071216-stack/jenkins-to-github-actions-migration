# legacy/ - the "before" state

This folder is a realistic snapshot of what a mid-sized Jenkins estate looks like
for a single service. Nothing here runs against a real controller; CI **validates**
it statically (Groovy parse + structural checks) and **replays** its build/test/image
commands in the parity job. See [ADR 0002](../docs/adr/0002-jenkinsfile-validation-strategy.md)
and [ADR 0005](../docs/adr/0005-parity-check.md).

| File | What it represents |
| --- | --- |
| [`Jenkinsfile`](Jenkinsfile) | Declarative pipeline: checkout, build, unit test, SonarQube, quality gate, Docker build, Trivy, push, deploy staging, manual approval, deploy production |
| [`shared-library/vars/nodeBuild.groovy`](shared-library/vars/nodeBuild.groovy) | "God template" shared library step used by many Node.js jobs |
| [`shared-library/vars/dockerBuildPush.groovy`](shared-library/vars/dockerBuildPush.groovy) | Image build and push with stored registry credentials |
| [`shared-library/vars/deployToAks.groovy`](shared-library/vars/deployToAks.groovy) | AKS deploy with a long-lived service principal secret |
| [`plugins.txt`](plugins.txt) | The plugin sprawl needed to run the pipeline above |

Every `[PROBLEM]` comment is a finding that the migration resolves:

| # | Problem in Jenkins | Resolution in GitHub Actions |
| --- | --- | --- |
| 1 | Long-lived credentials (`azure-sp-prod`, `acr-push`, `sonar-token`) | OIDC federation to Azure, `GITHUB_TOKEN` for GHCR, no stored cloud secrets |
| 2 | Snowflake agents (hand-built VM, tools pre-installed at unknown versions) | Ephemeral GitHub-hosted runners, every tool pinned in the workflow |
| 3 | Plugin sprawl (14 direct, ~90 transitive plugins) | Actions pinned by commit SHA and updated by Dependabot |
| 4 | Shared library loaded from `@master` | Reusable workflows and composite actions consumed by tag or SHA |
| 5 | `input` step holds a stage open, approvers are a free-text string | Environment protection rules with required reviewers, fully audited |
| 6 | Docker socket shared between jobs on one VM | Fresh, isolated runner VM per job |
| 7 | No SBOM, signature or provenance | Syft SBOM, cosign keyless signature, SLSA build provenance |
| 8 | SCM polling every 5 minutes | Webhook-driven `push` / `pull_request` events |
