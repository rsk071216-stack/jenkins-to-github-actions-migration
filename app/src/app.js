import { createServer } from "node:http";
import { bump, compare, RELEASE_TYPES, SemverError } from "./semver.js";

const MAX_BODY_BYTES = 16 * 1024;

export function buildInfo(env = process.env) {
  return {
    service: "versioning-service",
    version: env.APP_VERSION ?? "0.0.0-dev",
    commit: env.GIT_SHA ?? "unknown",
    node: process.version,
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new SemverError("request body too large");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new SemverError("request body must be valid JSON");
  }
}

export function createHandler({ env = process.env, isReady = () => true } = {}) {
  const info = buildInfo(env);

  return async function handler(req, res) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const route = `${req.method} ${url.pathname}`;

    try {
      switch (route) {
        case "GET /healthz":
          return sendJson(res, 200, { status: "ok" });
        case "GET /readyz":
          return isReady() ? sendJson(res, 200, { status: "ready" }) : sendJson(res, 503, { status: "not-ready" });
        case "GET /version":
          return sendJson(res, 200, info);
        case "POST /api/v1/versions/next": {
          const { current, releaseType, preid } = await readJson(req);
          const next = bump(current, releaseType, preid);
          return sendJson(res, 200, { current, releaseType, next });
        }
        case "GET /api/v1/versions/compare": {
          const a = url.searchParams.get("a");
          const b = url.searchParams.get("b");
          if (!a || !b) {
            return sendJson(res, 400, { error: "query parameters 'a' and 'b' are required" });
          }
          const result = compare(a, b);
          const relation = result === 0 ? "equal" : result < 0 ? "lower" : "higher";
          return sendJson(res, 200, { a, b, result, relation });
        }
        case "GET /api/v1/release-types":
          return sendJson(res, 200, { releaseTypes: RELEASE_TYPES });
        default:
          return sendJson(res, 404, { error: "not found" });
      }
    } catch (error) {
      if (error instanceof SemverError) {
        return sendJson(res, 400, { error: error.message });
      }
      console.error(JSON.stringify({ level: "error", msg: "unhandled error", error: String(error) }));
      return sendJson(res, 500, { error: "internal server error" });
    }
  };
}

export function start({
  port = Number(process.env.PORT ?? 8080),
  host = "0.0.0.0",
  handleSignals = true,
  exit = process.exit,
} = {}) {
  let ready = false;
  const server = createServer(createHandler({ isReady: () => ready }));
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;

  // Graceful shutdown: fail readiness first so Kubernetes stops routing traffic,
  // then drain in-flight requests. A hard deadline guards against hung sockets.
  const shutdown = (signal) => {
    ready = false;
    console.log(JSON.stringify({ level: "info", msg: "shutting down", signal }));
    server.close(() => exit(0));
    setTimeout(() => exit(1), 10_000).unref();
  };
  if (handleSignals) {
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  }

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      ready = true;
      const { port: boundPort } = server.address();
      console.log(JSON.stringify({ level: "info", msg: "listening", port: boundPort, ...buildInfo() }));
      resolve({ server, shutdown });
    });
  });
}
