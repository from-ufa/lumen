"use strict";

const crypto = require("crypto");
const { isPathAllowed, normalizePath } = require("./allowlist");

const DEFAULT_TIMEOUT_MS = 12_000;

/**
 * Send a GET request through a live Bridge WebSocket session.
 * @returns {Promise<{ status: number, contentType?: string, body: unknown }>}
 */
function requestViaBridge(session, rawPath, { timeoutMs = DEFAULT_TIMEOUT_MS, query } = {}) {
  return new Promise((resolve, reject) => {
    if (!session || !session.ws || session.ws.readyState !== 1) {
      reject(Object.assign(new Error("bridge_offline"), { code: "bridge_offline" }));
      return;
    }

    const pathOnly = normalizePath(rawPath);
    if (!pathOnly || !isPathAllowed(pathOnly)) {
      reject(Object.assign(new Error(`path_forbidden: ${rawPath}`), { code: "forbidden" }));
      return;
    }

    let path = pathOnly;
    if (query) {
      const q =
        typeof query === "string"
          ? query.replace(/^\?/, "")
          : new URLSearchParams(query).toString();
      if (q) path = `${pathOnly}?${q}`;
    }

    const id = crypto.randomUUID();
    const payload = {
      type: "request",
      id,
      method: "GET",
      path: pathOnly,
    };
    if (path.includes("?")) {
      payload.query = path.slice(path.indexOf("?") + 1);
    }

    const timer = setTimeout(() => {
      session.pending.delete(id);
      reject(Object.assign(new Error("bridge_timeout"), { code: "timeout" }));
    }, timeoutMs);

    session.pending.set(id, {
      resolve: (msg) => {
        clearTimeout(timer);
        session.pending.delete(id);
        resolve({
          status: msg.status ?? 502,
          contentType: msg.contentType,
          body: msg.body,
        });
      },
      reject: (err) => {
        clearTimeout(timer);
        session.pending.delete(id);
        reject(err);
      },
      timer,
    });

    try {
      session.ws.send(JSON.stringify(payload));
    } catch (err) {
      clearTimeout(timer);
      session.pending.delete(id);
      reject(err);
    }
  });
}

/**
 * Handle bridge→server response/error messages for pending requests.
 */
function handleBridgeReply(session, msg) {
  if (!session || !msg || !msg.id) return false;
  const pending = session.pending.get(msg.id);
  if (!pending) return false;

  if (msg.type === "response") {
    pending.resolve(msg);
    return true;
  }

  if (msg.type === "error") {
    const err = Object.assign(new Error(msg.message || msg.error || "bridge_error"), {
      code: msg.error || "bridge_error",
    });
    pending.reject(err);
    return true;
  }

  return false;
}

module.exports = {
  requestViaBridge,
  handleBridgeReply,
  DEFAULT_TIMEOUT_MS,
};
