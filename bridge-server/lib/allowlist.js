"use strict";

/** Same rules as lumen-bridge client (v1.1). */
const ALLOWED_PATH_RULES = [
  { exact: "/info" },
  { exact: "/peers/connected" },
  { exact: "/transactions/unconfirmed" },
  { prefix: "/blocks/" },
  { exact: "/blocks" },
  // Oracle operator (virtual paths on agent)
  { exact: "/oracle/status" },
  { exact: "/oracle/usd/metrics" },
  { exact: "/oracle/xau/metrics" },
];

function normalizePath(rawPath) {
  if (!rawPath || typeof rawPath !== "string") return null;
  let p = rawPath.trim();
  if (!p.startsWith("/")) p = `/${p}`;

  const q = p.indexOf("?");
  if (q !== -1) p = p.slice(0, q);
  const h = p.indexOf("#");
  if (h !== -1) p = p.slice(0, h);

  p = p.replace(/\/+/g, "/");
  if (
    p.includes("..") ||
    p.includes("\\") ||
    p.includes("%2e") ||
    p.includes("%2E")
  ) {
    return null;
  }

  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function isPathAllowed(pathname) {
  const p = normalizePath(pathname);
  if (!p) return false;
  for (const rule of ALLOWED_PATH_RULES) {
    if (rule.exact && p === rule.exact) return true;
    if (rule.prefix && p.startsWith(rule.prefix)) return true;
  }
  return false;
}

module.exports = {
  ALLOWED_PATH_RULES,
  normalizePath,
  isPathAllowed,
};
