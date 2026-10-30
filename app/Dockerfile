# Runtime-only image for a zero-dependency Node.js service.
#
# - Distroless base: no shell, no package manager, tiny CVE surface.
# - Pinned by tag AND digest so every build path (Jenkins, GitHub Actions,
#   a laptop) resolves exactly the same base layers. Dependabot bumps the digest.
# - Application files are root-owned and read-only for the runtime user;
#   the process runs as the distroless "nonroot" user (65532).
FROM gcr.io/distroless/nodejs22-debian13:nonroot@sha256:10747a1323be68f206aed893599d43e6697ad67257e7c42703553f99fbce3d33

ARG APP_VERSION=0.0.0-dev
ARG GIT_SHA=unknown

LABEL org.opencontainers.image.title="versioning-service" \
      org.opencontainers.image.description="Semantic version calculator API (Jenkins to GitHub Actions migration demo)" \
      org.opencontainers.image.source="https://github.com/rsk071216-stack/jenkins-to-github-actions-migration" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Raees Khan"

ENV NODE_ENV=production \
    PORT=8080 \
    APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA}

WORKDIR /app
COPY package.json ./
COPY src ./src

USER 65532:65532
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/nodejs/bin/node", "src/healthcheck.js"]

# The distroless entrypoint is /nodejs/bin/node, so CMD is the script to run.
CMD ["src/server.js"]
