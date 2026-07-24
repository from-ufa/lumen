"use strict";

const crypto = require("crypto");

/**
 * In-memory registry of tokens and live Bridge connections.
 * v1: process memory only (lost on restart).
 */
class BridgeRegistry {
  constructor() {
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
     *   pending: Map<string, { resolve: Function, reject: Function, timer: NodeJS.Timeout }>
     * }>}
     */
    this.connections = new Map();
  }

  createToken(label) {
    const token = `lumen_${crypto.randomBytes(16).toString("hex")}`;
    const entry = {
      token,
      createdAt: Date.now(),
      label: label || undefined,
    };
    this.tokens.set(token, entry);
    return entry;
  }

  /** Accept any previously issued token; also allow pre-register on first connect if flag set. */
  hasToken(token) {
    return typeof token === "string" && this.tokens.has(token);
  }

  /**
   * Ensure token exists. If autoRegister is true, unknown lumen_* tokens are stored.
   * Useful for manual tokens / smoke tests.
   */
  ensureToken(token, { autoRegister = false, label } = {}) {
    if (this.hasToken(token)) return this.tokens.get(token);
    if (autoRegister && typeof token === "string" && token.startsWith("lumen_")) {
      const entry = { token, createdAt: Date.now(), label: label || "auto" };
      this.tokens.set(token, entry);
      return entry;
    }
    return null;
  }

  listTokens() {
    return [...this.tokens.values()].map((t) => ({
      token: t.token,
      createdAt: t.createdAt,
      label: t.label,
      connected: this.connections.has(t.token),
    }));
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
    };
  }
}

module.exports = { BridgeRegistry };
