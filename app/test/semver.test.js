import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bump, compare, format, parse, SemverError } from "../src/semver.js";

describe("parse", () => {
  it("parses a plain version", () => {
    assert.deepEqual(parse("1.2.3"), { major: 1, minor: 2, patch: 3, prerelease: [], build: [] });
  });

  it("parses prerelease and build metadata", () => {
    const v = parse("2.0.0-rc.1+build.42");
    assert.deepEqual(v.prerelease, ["rc", "1"]);
    assert.deepEqual(v.build, ["build", "42"]);
  });

  it("rejects leading zeros and garbage", () => {
    for (const bad of ["01.2.3", "1.2", "v1.2.3", "1.2.3-", "", "latest"]) {
      assert.throws(() => parse(bad), SemverError, `expected "${bad}" to be rejected`);
    }
  });

  it("rejects non-string input", () => {
    assert.throws(() => parse(123), SemverError);
  });
});

describe("format", () => {
  it("round-trips a prerelease version", () => {
    assert.equal(format(parse("3.1.4-beta.2")), "3.1.4-beta.2");
  });
});

describe("bump", () => {
  const cases = [
    ["1.2.3", "major", "2.0.0"],
    ["1.2.3", "minor", "1.3.0"],
    ["1.2.3", "patch", "1.2.4"],
    ["1.2.3", "prerelease", "1.2.4-rc.0"],
    ["1.2.4-rc.0", "prerelease", "1.2.4-rc.1"],
    ["1.2.4-rc.x", "prerelease", "1.2.4-rc.0"],
    ["2.0.0-rc.3", "major", "2.0.0"],
    ["1.3.0-rc.1", "minor", "1.3.0"],
    ["1.3.1-rc.1", "minor", "1.4.0"],
    ["1.3.1-rc.1", "major", "2.0.0"],
    ["1.2.4-rc.1", "patch", "1.2.4"],
  ];

  for (const [current, type, expected] of cases) {
    it(`${current} + ${type} = ${expected}`, () => {
      assert.equal(bump(current, type), expected);
    });
  }

  it("supports a custom prerelease identifier", () => {
    assert.equal(bump("1.0.0", "prerelease", "beta"), "1.0.1-beta.0");
    assert.equal(bump("1.0.1-alpha.4", "prerelease", "beta"), "1.0.2-beta.0");
  });

  it("rejects unknown release types", () => {
    assert.throws(() => bump("1.0.0", "huge"), /releaseType must be one of/);
  });
});

describe("compare", () => {
  const cases = [
    ["1.0.0", "1.0.0", 0],
    ["1.0.0", "2.0.0", -1],
    ["1.10.0", "1.9.0", 1],
    ["1.0.1", "1.0.0", 1],
    ["1.0.0-rc.1", "1.0.0", -1],
    ["1.0.0", "1.0.0-rc.1", 1],
    ["1.0.0-alpha", "1.0.0-alpha.1", -1],
    ["1.0.0-alpha.1", "1.0.0-alpha", 1],
    ["1.0.0-alpha.1", "1.0.0-alpha.beta", -1],
    ["1.0.0-beta", "1.0.0-alpha.beta", 1],
    ["1.0.0-alpha.beta", "1.0.0-beta", -1],
    ["1.0.0-beta.11", "1.0.0-beta.2", 1],
    ["1.0.0-rc.1+build.1", "1.0.0-rc.1+build.2", 0],
  ];

  for (const [a, b, expected] of cases) {
    it(`compare(${a}, ${b}) = ${expected}`, () => {
      assert.equal(compare(a, b), expected);
    });
  }

  it("orders numeric identifiers before alphanumeric ones", () => {
    assert.equal(compare("1.0.0-1", "1.0.0-alpha"), -1);
    assert.equal(compare("1.0.0-alpha", "1.0.0-1"), 1);
  });
});
