"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

/**
 * Registry of bridge tokens + live WebSocket sessions.
 *
 * Tokens persist to disk (TOKEN_STORE_PATH) so restarts / renames do not
 * invalidate remote agents that still hold a previously issued token.
 * Live connections remain in-memory only.
 */

const DEFAULT_STORE =
  process.env.LUMEN_BRIDGE_TOKEN_STORE ||
  path.join(__dirname, "..", "data", "tokens.json");

/** lumen_* or legacy aether_* agent tokens */
function isBridgeTokenFormat(token) {
  return (
    typeof token === "string" &&
    (token.startsWith("lumen_") || token.startsWith("aether_")) &&
    token.length >= 20
  );
}

function tokenPreview(token) {
  if (!token || typeof token !== "string") return "?";
  if (token.length <= 16) return `${token.slice(0, 8)}…`;
  return `${token.slice(0, 12)}…${token.slice(-4)}`;
}

class BridgeRegistry {
  /**
   * @param {{ storePath?: string, persist?: boolean }} [opts]
   */
  constructor(opts = {}) {
    /** @type {Map<string, { token: string, createdAt: number, label?: string }>} */
    this.tokens = new Map();

    /**
     * @type {Map<string, {
     *   token: string,
     *   ws: import('ws').WebSocket,
     *   connectedAt: number,
     *   lastSeen: number,
     *   version?: string,
     *   node?: string,
     *   remoteAddress?: string,
     *   publicIp?: string|null,
     *   pending: Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>
     * }>}
     */
    this.connections = new Map();

    this.storePath = opts.storePath || DEFAULT_STORE;
    this.persistEnabled = opts.persist !== false;
    this._load();
  }

  _load() {
    if (!this.persistEnabled) return;
    try {
      if (!fs.existsSync(this.storePath)) return;
      const raw = fs.readFileSync(this.storePath, "utf8");
      const data = JSON.parse(raw);
      const list = Array.isArray(data?.tokens) ? data.tokens : [];
      for (const t of list) {
        if (!t || typeof t.token !== "string" || !isBridgeTokenFormat(t.token)) continue;
        this.tokens.set(t.token, {
          token: t.token,
          createdAt: Number(t.createdAt) || Date.now(),
          label: typeof t.label === "string" ? t.label : undefined,
        });
      }
    } catch (err) {
      console.error(
        `[registry] failed to load token store ${this.storePath}: ${err.message}`
      );
    }
  }

  _save() {
    if (!this.persistEnabled) return;
    try {
      const dir = path.dirname(this.storePath);
      fs.mkdirSync(dir, { recursive: true });
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        tokens: [...this.tokens.values()].map((t) => ({
          token: t.token,
          createdAt: t.createdAt,
          label: t.label || null,
        })),
      };
      const tmp = `${this.storePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, this.storePath);
      try {
        fs.chmodSync(this.storePath, 0o600);
      } catch {
        /* ignore */
      }
    } catch (err) {
      console.error(
        `[registry] failed to save token store ${this.storePath}: ${err.message}`
      );
    }
  }

  createToken(label) {
    const token = `lumen_${crypto.randomBytes(16).toString("hex")}`;
    const entry = {
      token,
      createdAt: Date.now(),
      label: label || undefined,
    };
    this.tokens.set(token, entry);
    this._save();
    return entry;
  }

  /** Accept any previously issued token; also allow pre-register on first connect if flag set. */
  hasToken(token) {
    return typeof token === "string" && this.tokens.has(token);
  }

  /**
   * Ensure token exists. If autoRegister is true, unknown lumen_ or aether_ tokens are stored.
   * Useful for manual tokens / smoke tests.
   */
  ensureToken(token, { autoRegister = false, label } = {}) {
    if (this.hasToken(token)) return this.tokens.get(token);
    if (autoRegister && isBridgeTokenFormat(token)) {
      const entry = {
        token,
        createdAt: Date.now(),
        label: label || "auto",
      };
      this.tokens.set(token, entry);
      this._save();
      return entry;
    }
    return null;
  }

  /** Explicitly register a known token string (e.g. import / recovery). */
  addToken(token, label) {
    if (!isBridgeTokenFormat(token)) return null;
    if (this.hasToken(token)) return this.tokens.get(token);
    const entry = {
      token,
      createdAt: Date.now(),
      label: label || "imported",
    };
    this.tokens.set(token, entry);
    this._save();
    return entry;
  }

  listTokens() {
    // Full secrets — only for trusted/local admin paths (avoid on public API)
    return [...this.tokens.values()].map((t) => ({
      token: t.token,
      createdAt: t.createdAt,
      label: t.label,
      connected: this.connections.has(t.token),
    }));
  }

  /** Public-safe list: no plaintext token (S2 security) */
  listTokensPublic() {
    const crypto = require("crypto");
    return [...this.tokens.values()].map((t) => {
      const fp = crypto
        .createHash("sha256")
        .update(t.token)
        .digest("hex")
        .slice(0, 12);
      return {
        tokenFp: fp,
        tokenTail: t.token.slice(-4),
        createdAt: t.createdAt,
        label: t.label ?? null,
        connected: this.connections.has(t.token),
      };
    });
  }

  registerConnection(token, ws, meta = {}) {
    // Drop previous connection for same token
    const prev = this.connections.get(token);
    if (prev && prev.ws !== ws) {
      try {
        prev.ws.close(4000, "replaced by new bridge session");
      } catch {
        /* ignore */
      }
      this.rejectAllPending(prev, new Error("connection replaced"));
    }

    const session = {
      token,
      ws,
      connectedAt: Date.now(),
      lastSeen: Date.now(),
      version: meta.version,
      node: meta.node,
      remoteAddress: meta.remoteAddress,
      /** Optional public IPv4 reported by the agent (hello.publicIp) */
      publicIp: meta.publicIp || null,
      /** From hello.capabilities.oracles — e.g. ["erg-usd"] */
      oracles: Array.isArray(meta.oracles) ? meta.oracles.slice() : [],
      capabilities: meta.capabilities || null,
      pending: new Map(),
    };
    this.connections.set(token, session);
    return session;
  }

  touch(token) {
    const s = this.connections.get(token);
    if (s) s.lastSeen = Date.now();
  }

  getConnection(token) {
    return this.connections.get(token) || null;
  }

  isConnected(token) {
    const s = this.connections.get(token);
    if (!s) return false;
    if (s.ws.readyState !== 1 /* OPEN */) {
      this.removeConnection(token, s.ws);
      return false;
    }
    return true;
  }

  removeConnection(token, ws) {
    const s = this.connections.get(token);
    if (!s) return;
    if (ws && s.ws !== ws) return; // stale socket
    this.rejectAllPending(s, new Error("bridge disconnected"));
    this.connections.delete(token);
  }

  rejectAllPending(session, err) {
    for (const [, p] of session.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    session.pending.clear();
  }

  status(token) {
    const tok = this.tokens.get(token);
    const conn = this.connections.get(token);
    const open = conn && conn.ws.readyState === 1;
    return {
      token,
      known: !!tok,
      createdAt: tok?.createdAt ?? null,
      label: tok?.label ?? null,
      connected: !!open,
      connectedAt: open ? conn.connectedAt : null,
      lastSeen: open ? conn.lastSeen : null,
      version: open ? conn.version : null,
      node: open ? conn.node : null,
      remoteAddress: open ? conn.remoteAddress : null,
      publicIp: open ? conn.publicIp || null : null,
      oracles: open ? conn.oracles || [] : [],
      pendingRequests: open ? conn.pending.size : 0,
    };
  }

  stats() {
    let connected = 0;
    for (const s of this.connections.values()) {
      if (s.ws.readyState === 1) connected += 1;
    }
    return {
      tokens: this.tokens.size,
      connections: connected,
      storePath: this.persistEnabled ? this.storePath : null,
    };
  }

  /**
   * Public aggregate counts — no tokens, IPs, or labels.
   * Used by dashboard / oracle invites.
   */
  publicStats() {
    let connections = 0;
    let withOracle = 0;
    let withNode = 0;
    /** @type {Record<string, number>} */
    const oracles = {};

    for (const s of this.connections.values()) {
      if (s.ws.readyState !== 1 /* OPEN */) continue;
      connections += 1;
      if (s.node) withNode += 1;
      const list = Array.isArray(s.oracles) ? s.oracles : [];
      if (list.length > 0) withOracle += 1;
      for (const id of list) {
        if (typeof id !== "string" || !id) continue;
        oracles[id] = (oracles[id] || 0) + 1;
      }
    }

    return {
      generatedAt: Date.now(),
      tokensIssued: this.tokens.size,
      connections,
      withNode,
      withOracle,
      oracles,
    };
  }
}

module.exports = { BridgeRegistry, isBridgeTokenFormat, tokenPreview };
