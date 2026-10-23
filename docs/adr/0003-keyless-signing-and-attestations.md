# ADR 0003: Keyless signing, SBOM attestation and SLSA provenance for every published image

- Status: accepted
- Date: 2026-10-23

## Context

The Jenkins pipeline pushes an image with a static registry password and produces no evidence
of where the image came from. Anyone with that password can push an image that production
will happily run.

## Decision

On pushes to `main` only, the reusable container workflow:

1. Generates an **SPDX SBOM** with Syft (`anchore/sbom-action`) from the exact image that is
   scanned and pushed.
2. Gates on **Trivy** (CRITICAL/HIGH, fixed vulnerabilities only) before anything leaves the
   runner; uploads SARIF to code scanning.
3. Pushes to **GHCR with the job-scoped `GITHUB_TOKEN`**.
4. Signs the digest with **cosign keyless** (Sigstore Fulcio certificate bound to the
   workflow identity, entry in the Rekor transparency log). No private key exists.
5. Attaches the SBOM as a **cosign attestation** (`--type spdxjson`).
6. Creates a **SLSA build provenance attestation** with `actions/attest-build-provenance`,
   stored in GitHub's attestation API and pushed to the registry.

`deploy.yml` verifies both the signature (identity must be a workflow of this repository on
`refs/heads/main`) and the provenance before deploying, and deploys by **digest**.

Permissions are granted only to the `image-publish` caller job on `main`:
`packages: write`, `id-token: write`, `attestations: write`, `security-events: write`.
Pull requests run the same workflow with `contents: read` only.

## Consequences

- An attacker with registry write access still cannot produce an image that passes the deploy
  gate.
- Verification depends on the public Sigstore infrastructure (for public repositories) and
  the GitHub attestation API.
- Images are built for `linux/amd64` only; multi-arch is a roadmap item.
- `actions/attest-build-provenance` v4 is a thin wrapper around `actions/attest`; switching is
  a one-line change when convenient.
