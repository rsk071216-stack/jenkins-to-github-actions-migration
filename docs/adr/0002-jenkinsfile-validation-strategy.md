# ADR 0002: Validate the legacy Jenkinsfile statically, replay its commands for parity

- Status: accepted
- Date: 2026-10-23

## Context

The legacy `Jenkinsfile` is part of the evidence in this repository. If it silently rots
(syntax errors, renamed stages, commands that no longer match the app), the before/after
story becomes untrustworthy. Options considered:

1. **Run it with `jenkins/jenkinsfile-runner`** in CI.
2. **Start a Jenkins LTS controller in a service container** and call the declarative linter
   endpoint (`/pipeline-model-converter/validate`).
3. **Static validation** with the Groovy compiler plus structural checks, and **replay** of
   the build/test commands in the parity job.

Findings:

- (1) The Jenkinsfile depends on things that do not exist in CI by design: the `docker` agent
  label, the `azure-sp-prod`, `acr-push` and `sonar-token` credentials, a SonarQube server,
  the shared library repository, Slack and two AKS clusters. Making it run means stubbing
  most of them, so a green result would prove little. The runner image also bundles a
  specific plugin set that has to be kept in sync with `plugins.txt`, and it is heavy and
  slow to start. Reliability was judged insufficient for a required check.
- (2) Validates declarative semantics properly, but needs plugin installation at boot
  (network-dependent, minutes per run) and an authenticated crumb flow. Flaky as a required
  check; good as an optional nightly job.
- (3) Fast (seconds), deterministic, no network beyond a checksum-verified Maven Central jar.

## Decision

Option 3, in the `legacy-validate` job:

- `scripts/legacy/GroovyParseCheck.java` compiles (never executes) the Jenkinsfile and every
  shared library step with the Groovy 4 compiler (jar SHA-256 verified). This catches syntax
  errors, unbalanced closures and invalid string interpolation.
- `scripts/legacy/validate-jenkinsfile.sh` asserts the declarative skeleton, the presence of
  every stage the migration maps, an exactly pinned agent image, no hard-coded secrets, and
  that the commands the parity job replays can be extracted.
- The **parity job** extracts the agent image and the `sh` commands of the "Unit Test" and
  "Docker Build" stages **from the Jenkinsfile itself** and executes them, so the legacy
  definition cannot drift from what is compared.

## Consequences

- Declarative-only mistakes (for example `when` in the wrong place or an unknown directive)
  are not detected. Jenkins runs Groovy 2.4 with the CPS transform, so a file that compiles
  under Groovy 4 can in rare cases still fail on a controller.
- In a client engagement where Jenkins is still running, I add option 2 against the real
  controller (`curl -X POST -F "jenkinsfile=<Jenkinsfile" $JENKINS_URL/pipeline-model-converter/validate`)
  during the parallel-run phase, where it costs nothing extra.
