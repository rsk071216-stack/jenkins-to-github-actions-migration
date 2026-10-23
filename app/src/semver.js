// Minimal Semantic Versioning 2.0.0 helpers used by the versioning service.
// Intentionally dependency-free so the service has no third-party supply chain.

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export const RELEASE_TYPES = Object.freeze(["major", "minor", "patch", "prerelease"]);

export class SemverError extends Error {
  constructor(message) {
    super(message);
    this.name = "SemverError";
  }
}

export function parse(version) {
  if (typeof version !== "string") {
    throw new SemverError("version must be a string");
  }
  const match = SEMVER_PATTERN.exec(version.trim());
  if (!match) {
    throw new SemverError(`invalid semantic version: "${version}"`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
    build: match[5] ? match[5].split(".") : [],
  };
}

export function format({ major, minor, patch, prerelease = [] }) {
  const core = `${major}.${minor}.${patch}`;
  return prerelease.length > 0 ? `${core}-${prerelease.join(".")}` : core;
}

export function bump(version, releaseType, preid = "rc") {
  if (!RELEASE_TYPES.includes(releaseType)) {
    throw new SemverError(`releaseType must be one of: ${RELEASE_TYPES.join(", ")}`);
  }
  const v = parse(version);
  const isPrerelease = v.prerelease.length > 0;

  switch (releaseType) {
    case "major":
      // 2.0.0-rc.1 -> 2.0.0 (finalise), otherwise increment major.
      if (isPrerelease && v.minor === 0 && v.patch === 0) {
        return format({ ...v, prerelease: [] });
      }
      return format({ major: v.major + 1, minor: 0, patch: 0 });
    case "minor":
      if (isPrerelease && v.patch === 0) {
        return format({ ...v, prerelease: [] });
      }
      return format({ major: v.major, minor: v.minor + 1, patch: 0 });
    case "patch":
      if (isPrerelease) {
        return format({ ...v, prerelease: [] });
      }
      return format({ major: v.major, minor: v.minor, patch: v.patch + 1 });
    default: {
      // prerelease: 1.2.3 -> 1.2.4-rc.0, 1.2.4-rc.0 -> 1.2.4-rc.1
      if (isPrerelease && v.prerelease[0] === preid) {
        const counter = Number(v.prerelease[1] ?? -1);
        const next = Number.isInteger(counter) ? counter + 1 : 0;
        return format({ ...v, prerelease: [preid, String(next)] });
      }
      return format({ major: v.major, minor: v.minor, patch: v.patch + 1, prerelease: [preid, "0"] });
    }
  }
}

function compareIdentifiers(a, b) {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) {
    return Math.sign(Number(a) - Number(b));
  }
  if (aNum) {
    return -1;
  }
  if (bNum) {
    return 1;
  }
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function compare(left, right) {
  const a = parse(left);
  const b = parse(right);
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) {
      return Math.sign(a[key] - b[key]);
    }
  }
  // A version without prerelease has higher precedence than one with it.
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return Math.sign(b.prerelease.length - a.prerelease.length);
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i++) {
    if (a.prerelease[i] === undefined) {
      return -1;
    }
    if (b.prerelease[i] === undefined) {
      return 1;
    }
    const result = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (result !== 0) {
      return result;
    }
  }
  return 0;
}
