# ADR 0005: Automated parity check between the Jenkins and GitHub Actions pipelines

- Status: accepted
- Date: 2026-10-23

## Context

The question every engineering manager asks before a cut-over is: *"How do we know the new
pipeline does the same thing as the old one?"* Reviewing YAML side by side does not answer
it. Divergence usually hides in agent images, tool versions, build arguments, or a stage that
was quietly dropped.

## Decision

A `parity` job runs on every push and pull request and **fails the build on divergence**.

**Test parity**

| Path | How |
| --- | --- |
| Jenkins | The agent image (`agent { docker { image ... } }`), its `args`, the `dir()` and the `sh` command of the "Unit Test" stage are **extracted from `legacy/Jenkinsfile`** and executed with `docker run`, mounting the workspace and using a non-root uid, as the docker-workflow plugin does |
| GitHub Actions | The JUnit report produced by the `test` job (composite action, `setup-node`) is downloaded as an artifact |

Compared: number of test cases, failures, skipped tests, and the sorted list of test names.

**Image parity**

| Path | How |
| --- | --- |
| Jenkins | The `sh` command of the "Docker Build" stage is extracted from the Jenkinsfile and executed with the runner's default `docker build` (before Buildx is set up) |
| GitHub Actions | `docker/build-push-action` with a Buildx `docker-container` builder and the GHA cache, as in the reusable workflow |

Compared, as gating checks:

- **Runtime config**: `User`, `Env`, `Entrypoint`, `Cmd`, `WorkingDir`, `ExposedPorts`,
  `Labels`, `Healthcheck`.
- **Filesystem content**: both images are flattened with `docker export` and every entry is
  listed with path, mode, owner, size and SHA-256 (`scripts/parity/fs-manifest.py`).
- **SBOM packages**: Syft package list (type, name, version) for both images.

Informational only: **layer digests** (`RootFS.Layers`). Different builders can produce
different tar headers for identical content, so a mismatch there is reported, not fatal.

Not compared: image ID, manifest digest, creation timestamp (expected to differ).

Evidence: the job summary renders the report, and the `parity-report` artifact keeps the raw
inputs (JUnit files, manifests, package lists) for 30 days.

## Consequences

- Stages with external side effects (SonarQube, push, deploy) are not replayed; their
  equivalence is covered by design review and by the concept mapping. SonarQube is not part
  of the migrated pipeline in this demo (no server); coverage gates and Biome linting run
  instead, and a Sonar step can be added with a token secret.
- The parity job doubles the image build cost on each run. In an engagement it runs during
  the parallel-run phase and is removed (or made nightly) after cut-over.
- Because commands are extracted from the Jenkinsfile, editing the Jenkinsfile changes what
  is compared: the structural checks in `legacy-validate` fail loudly if extraction breaks.
