import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { buildInfo, createHandler, start } from "../src/app.js";

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function silenced(fn) {
  const { log, error } = console;
  console.log = () => {};
  console.error = () => {};
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = log;
      console.error = error;
    });
}

describe("HTTP API", () => {
  let server;
  let baseUrl;
  let ready = true;

  before(async () => {
    ({ server, baseUrl } = await listen(
      createHandler({ env: { APP_VERSION: "1.4.0", GIT_SHA: "abc1234" }, isReady: () => ready }),
    ));
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it("GET /healthz returns ok", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  });

  it("GET /readyz reflects readiness", async () => {
    assert.equal((await fetch(`${baseUrl}/readyz`)).status, 200);
    ready = false;
    assert.equal((await fetch(`${baseUrl}/readyz`)).status, 503);
    ready = true;
  });

  it("GET /version exposes build metadata", async () => {
    const body = await (await fetch(`${baseUrl}/version`)).json();
    assert.equal(body.version, "1.4.0");
    assert.equal(body.commit, "abc1234");
    assert.equal(body.service, "versioning-service");
  });

  it("POST /api/v1/versions/next calculates the next version", async () => {
    const res = await fetch(`${baseUrl}/api/v1/versions/next`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ current: "1.4.0", releaseType: "minor" }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { current: "1.4.0", releaseType: "minor", next: "1.5.0" });
  });

  it("POST /api/v1/versions/next returns 400 for invalid input", async () => {
    const res = await fetch(`${baseUrl}/api/v1/versions/next`, {
      method: "POST",
      body: JSON.stringify({ current: "not-a-version", releaseType: "minor" }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /invalid semantic version/);
  });

  it("POST /api/v1/versions/next returns 400 for malformed JSON", async () => {
    const res = await fetch(`${baseUrl}/api/v1/versions/next`, { method: "POST", body: "{oops" });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /valid JSON/);
  });

  it("POST /api/v1/versions/next treats an empty body as an empty object", async () => {
    const res = await fetch(`${baseUrl}/api/v1/versions/next`, { method: "POST" });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /must be a string|releaseType/);
  });

  it("POST /api/v1/versions/next rejects oversized bodies", async () => {
    const res = await fetch(`${baseUrl}/api/v1/versions/next`, {
      method: "POST",
      body: JSON.stringify({ padding: "x".repeat(20_000) }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /too large/);
  });

  it("GET /api/v1/versions/compare compares two versions", async () => {
    const res = await fetch(`${baseUrl}/api/v1/versions/compare?a=1.2.0&b=1.10.0`);
    assert.deepEqual(await res.json(), { a: "1.2.0", b: "1.10.0", result: -1, relation: "lower" });
    const eq = await (await fetch(`${baseUrl}/api/v1/versions/compare?a=1.0.0&b=1.0.0`)).json();
    assert.equal(eq.relation, "equal");
    const hi = await (await fetch(`${baseUrl}/api/v1/versions/compare?a=2.0.0&b=1.0.0`)).json();
    assert.equal(hi.relation, "higher");
  });

  it("GET /api/v1/versions/compare requires both parameters", async () => {
    const res = await fetch(`${baseUrl}/api/v1/versions/compare?a=1.0.0`);
    assert.equal(res.status, 400);
  });

  it("GET /api/v1/release-types lists supported release types", async () => {
    const body = await (await fetch(`${baseUrl}/api/v1/release-types`)).json();
    assert.deepEqual(body.releaseTypes, ["major", "minor", "patch", "prerelease"]);
  });

  it("returns 404 for unknown routes", async () => {
    const res = await fetch(`${baseUrl}/nope`);
    assert.equal(res.status, 404);
  });
});

describe("error handling", () => {
  it("returns 500 without leaking details for unexpected errors", async () => {
    const handler = createHandler({
      env: {},
      isReady: () => {
        throw new Error("boom");
      },
    });
    const { server, baseUrl } = await listen(handler);
    try {
      await silenced(async () => {
        const res = await fetch(`${baseUrl}/readyz`);
        assert.equal(res.status, 500);
        assert.deepEqual(await res.json(), { error: "internal server error" });
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("uses default options when none are given", async () => {
    const { server, baseUrl } = await listen(createHandler());
    try {
      assert.equal((await fetch(`${baseUrl}/readyz`)).status, 200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

describe("buildInfo", () => {
  it("falls back to development defaults", () => {
    const info = buildInfo({});
    assert.equal(info.version, "0.0.0-dev");
    assert.equal(info.commit, "unknown");
  });
});

describe("start", () => {
  it("listens, becomes ready and shuts down gracefully", async () => {
    await silenced(async () => {
      let resolveExit;
      const exited = new Promise((resolve) => {
        resolveExit = resolve;
      });
      const { server, shutdown } = await start({
        port: 0,
        host: "127.0.0.1",
        handleSignals: false,
        exit: (code) => resolveExit(code),
      });
      const { port } = server.address();
      assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200);

      shutdown("SIGTERM");
      assert.equal(await exited, 0);
      assert.equal(server.listening, false);
    });
  });
});
