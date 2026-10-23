# ADR 0001: A zero-dependency Node.js 22 service as the demo workload

- Status: accepted
- Date: 2026-10-23

## Context

The repository exists to demonstrate a pipeline migration, not an application. The workload
must still be realistic enough that the pipeline does real work: compile/test, coverage gates,
a container image with a real SBOM, a vulnerability scan, and a health-checked runtime.

Constraints:

- Every dependency must be pinned to an exact version with a committed lockfile. Generating a
  lockfile in CI is not acceptable (it would make the "pinned" claim false).
- The author's workstation used to build this repository has no Node.js, Java or Docker; heavy
  work happens in GitHub Actions.

## Decision

A small REST API ("versioning-service": calculates and compares semantic versions) written
for **Node.js 22 with zero runtime and zero development dependencies**:

- HTTP via `node:http`, tests via the built-in `node:test` runner, coverage via
  `--experimental-test-coverage` with line/branch/function thresholds, JUnit and LCOV via
  built-in reporters.
- With no dependencies there is nothing to lock, so `package.json` without a lockfile is
  fully reproducible. The composite action runs `npm ci` automatically if a lockfile appears.
- Linting with Biome (single static binary, pinned version) instead of ESLint (which would
  need `node_modules`).
- Runtime image `gcr.io/distroless/nodejs22-debian13:nonroot`, pinned by **tag and digest**.

## Consequences

- Positive: no third-party supply chain in the application; SBOM contains only OS and
  runtime packages; Trivy findings come from the base image only, which Dependabot updates.
- Positive: the same pattern works for Java/Maven services; the reusable workflow is
  language-agnostic.
- Negative: a real service would normally have dependencies; the `npm` Dependabot ecosystem
  is configured so the pipeline is ready for that.
