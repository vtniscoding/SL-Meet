/**
 * Lightweight SemVer 2.0.0 Parser & Comparator Utilities
 * Zero external dependencies — safe for browser, WebWorker, and Node runtimes.
 */

const SEMVER_REGEX =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;

/**
 * Parse a SemVer string (with optional leading "v") into structured components.
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number, prerelease: string[] } | null}
 */
export function parseSemver(version) {
  if (typeof version !== 'string') return null;
  const trimmed = version.trim();
  if (!trimmed) return null;

  const match = SEMVER_REGEX.exec(trimmed);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareIdentifiers(a, b) {
  const aIsNum = /^\d+$/.test(a);
  const bIsNum = /^\d+$/.test(b);

  if (aIsNum && bIsNum) {
    const diff = Number(a) - Number(b);
    return diff === 0 ? 0 : diff > 0 ? 1 : -1;
  }
  if (aIsNum && !bIsNum) return -1;
  if (!aIsNum && bIsNum) return 1;
  if (a === b) return 0;
  return a > b ? 1 : -1;
}

/**
 * Compare two SemVer strings according to SemVer 2.0.0 precedence rules.
 * Returns 1 if `a > b`, -1 if `a < b`, and 0 if equal or invalid.
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function compareSemver(a, b) {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);
  if (!parsedA || !parsedB) return 0;

  if (parsedA.major !== parsedB.major) {
    return parsedA.major > parsedB.major ? 1 : -1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor > parsedB.minor ? 1 : -1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch > parsedB.patch ? 1 : -1;
  }

  const preA = parsedA.prerelease;
  const preB = parsedB.prerelease;

  if (preA.length === 0 && preB.length === 0) return 0;
  // Normal version has higher precedence than a pre-release version
  if (preA.length === 0) return 1;
  if (preB.length === 0) return -1;

  const len = Math.max(preA.length, preB.length);
  for (let i = 0; i < len; i += 1) {
    if (i >= preA.length) return -1;
    if (i >= preB.length) return 1;
    const cmp = compareIdentifiers(preA[i], preB[i]);
    if (cmp !== 0) return cmp;
  }

  return 0;
}

/**
 * Determine whether `candidateVersion` is strictly newer than `currentVersion`.
 * @param {string} currentVersion
 * @param {string} candidateVersion
 * @returns {boolean}
 */
export function isNewerVersion(currentVersion, candidateVersion) {
  if (!parseSemver(currentVersion) || !parseSemver(candidateVersion)) {
    return false;
  }
  return compareSemver(candidateVersion, currentVersion) === 1;
}

