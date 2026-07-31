/**
 * TA-2 alert engine: bridge + node + oracle signals → edge notify via Bot API.
 * Opt-in only; does not touch web UI.
 */

import { bridgeServerFetch } from "./bridge-server";
import { replyHtml, tgApi } from "./tg-bot";
import {
  decryptToken,
  listEnabledSubs,
  touchSubTick,
  type TgAlertState,
  type TgAlertSubscription,
  updateSubState,
} from "./tg-alerts-store";

const COOLDOWN_MS: Record<string, number> = {
  "bridge.offline": 30 * 60_000,
  "bridge.online": 10 * 60_000,
  "node.unreachable": 30 * 60_000,
  "node.peers_low": 2 * 60 * 60_000,
  "node.sync_lag": 60 * 60_000,
  "node.height_stuck": 2 * 60 * 60_000,
  "node.online": 10 * 60_000,
  "oracle.agent_down": 30 * 60_000,
  "oracle.post_lag": 60 * 60_000,
  "oracle.low_gas": 12 * 60 * 60_000,
  "oracle.missed_refresh": 60 * 60_000,
};

/** Headers lag (full vs headers on same node) before warn */
const NODE_HEADER_LAG_BLOCKS = 50;
/** Behind lumen host tip before warn */
const NODE_NETWORK_LAG_BLOCKS = 80;
/** Same fullHeight this long → height stuck */
const NODE_HEIGHT_STUCK_MS = 30 * 60_000;

type Desired = {
  key: string;
  status: "ok" | "bad";
  severity: "critical" | "warn" | "ok";
  title: string;
  body: string[];
  meta?: TgAlertState["meta"];
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function baseKey(key: string): string {
  return key.includes(":") ? key.split(":")[0] : key;
}

async function probeBridge(token: string): Promise<{
  connected: boolean;
  known: boolean;
  version: string | null;
  oracles: string[];
  error?: string;
}> {
  try {
    const upstream = await bridgeServerFetch(
      `/status?token=${encodeURIComponent(token)}`,
      {
        headers: { Accept: "application/json" },
        timeoutMs: 8_000,
      }
    );
    const data = (await upstream.json().catch(() => ({}))) as {
      connected?: boolean;
      known?: boolean;
      version?: string | null;
      oracles?: string[];
      error?: string;
    };
    return {
      connected: !!data.connected,
      known: data.known !== false,
      version: data.version ?? null,
      oracles: Array.isArray(data.oracles) ? data.oracles : [],
      error: data.error,
    };
  } catch (e) {
    return {
      connected: false,
      known: false,
      version: null,
      oracles: [],
      error: e instanceof Error ? e.message : "bridge_unreachable",
    };
  }
}

/** Operator node via Bridge proxy */
async function probeNode(token: string): Promise<{
  ok: boolean;
  fullHeight: number | null;
  headersHeight: number | null;
  peersCount: number | null;
  name: string | null;
  error?: string;
}> {
  try {
    const upstream = await bridgeServerFetch(`/api/bridge/node/info`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Lumen-Bridge-Token": token,
      },
      timeoutMs: 12_000,
    });
    const data = (await upstream.json().catch(() => ({}))) as {
      fullHeight?: number;
      headersHeight?: number;
      peersCount?: number;
      name?: string;
      error?: string;
      message?: string;
    };
    if (!upstream.ok) {
      return {
        ok: false,
        fullHeight: null,
        headersHeight: null,
        peersCount: null,
        name: null,
        error:
          data.error ||
          data.message ||
          `http_${upstream.status}`,
      };
    }
    const full =
      typeof data.fullHeight === "number" ? data.fullHeight : null;
    const headers =
      typeof data.headersHeight === "number" ? data.headersHeight : null;
    if (full == null && headers == null) {
      return {
        ok: false,
        fullHeight: null,
        headersHeight: null,
        peersCount: null,
        name: null,
        error: "empty_info",
      };
    }
    return {
      ok: true,
      fullHeight: full,
      headersHeight: headers,
      peersCount:
        typeof data.peersCount === "number" ? data.peersCount : null,
      name: typeof data.name === "string" ? data.name : null,
    };
  } catch (e) {
    return {
      ok: false,
      fullHeight: null,
      headersHeight: null,
      peersCount: null,
      name: null,
      error: e instanceof Error ? e.message : "node_probe_failed",
    };
  }
}

/** Lumen host tip for network lag comparison (best-effort) */
async function probeLumenTip(): Promise<number | null> {
  const base =
    process.env.LUMEN_INTERNAL_URL?.trim() || "http://127.0.0.1:3000";
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/node/info`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      fullHeight?: number;
      headersHeight?: number;
    };
    if (typeof data.fullHeight === "number") return data.fullHeight;
    if (typeof data.headersHeight === "number") return data.headersHeight;
    return null;
  } catch {
    return null;
  }
}

async function probeOraclesDetailed(token: string): Promise<{
  feeds: Array<{
    id: string;
    pair: string;
    isHealthy: boolean | null;
    postAgeBlocks: number | null;
    claimable: number | null;
    liveMax: number;
    walletErg: number | null;
    inLastRefresh: boolean | null;
  }>;
  error?: string;
}> {
  const base =
    process.env.LUMEN_INTERNAL_URL?.trim() || "http://127.0.0.1:3000";
  try {
    const res = await fetch(
      `${base.replace(/\/$/, "")}/api/oracles?mode=my&token=${encodeURIComponent(token)}`,
      {
        headers: {
          Accept: "application/json",
          "X-Lumen-Bridge-Token": token,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(14_000),
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      feeds?: Array<{
        id?: string;
        pair?: string;
        scope?: string | null;
        myOperator?: {
          isHealthy?: boolean | null;
          postAgeBlocks?: number | null;
          claimableRewards?: number | null;
          walletErg?: number | null;
          inLastRefresh?: boolean | null;
        } | null;
        statusThresholds?: { liveMax?: number };
      }>;
      error?: string;
    };
    if (!res.ok) {
      return { feeds: [], error: data.error || `http_${res.status}` };
    }
    return {
      feeds: (data.feeds || [])
        .filter((f) => f.scope === "mine" || f.myOperator)
        .map((f) => ({
          id: f.id || "?",
          pair: f.pair || f.id || "?",
          isHealthy: f.myOperator?.isHealthy ?? null,
          postAgeBlocks: f.myOperator?.postAgeBlocks ?? null,
          claimable: f.myOperator?.claimableRewards ?? null,
          liveMax: f.statusThresholds?.liveMax ?? 24,
          walletErg: f.myOperator?.walletErg ?? null,
          inLastRefresh: f.myOperator?.inLastRefresh ?? null,
        })),
    };
  } catch (e) {
    return {
      feeds: [],
      error: e instanceof Error ? e.message : "oracles_fetch_failed",
    };
  }
}

function cooldownOk(
  prev: TgAlertState | undefined,
  key: string,
  now: number
): boolean {
  if (!prev?.lastNotifiedAt) return true;
  const base = baseKey(key);
  const ms = COOLDOWN_MS[base] ?? 30 * 60_000;
  return now - prev.lastNotifiedAt >= ms;
}

async function sendAlert(chatId: number, d: Desired): Promise<boolean> {
  const icon =
    d.severity === "critical" ? "⚠️" : d.severity === "warn" ? "⚡" : "✅";
  const html = [
    `${icon} <b>${esc(d.title)}</b>`,
    "",
    ...d.body.map((l) => esc(l)),
    "",
    "<i>Lumen · Mini App → Alerts</i>",
  ].join("\n");
  const res = await replyHtml(chatId, html, true);
  return !!res.ok;
}

function applyEdge(
  sub: TgAlertSubscription,
  desired: Desired,
  now: number
): { notify: boolean; next: TgAlertState } {
  const prev = sub.state[desired.key];
  const prevStatus = prev?.status ?? "unknown";
  const nextStatus = desired.status;
  const meta = desired.meta ?? prev?.meta;

  if (!prev || prevStatus === "unknown") {
    const notify = nextStatus === "bad" && cooldownOk(prev, desired.key, now);
    return {
      notify,
      next: {
        status: nextStatus,
        since: now,
        lastNotifiedAt: notify ? now : prev?.lastNotifiedAt ?? null,
        meta,
      },
    };
  }

  if (prevStatus === nextStatus) {
    return {
      notify: false,
      next: {
        status: nextStatus,
        since: prev.since,
        lastNotifiedAt: prev.lastNotifiedAt,
        meta: desired.meta ?? prev.meta,
      },
    };
  }

  const notify = cooldownOk(prev, desired.key, now);
  return {
    notify,
    next: {
      status: nextStatus,
      since: now,
      lastNotifiedAt: notify ? now : prev.lastNotifiedAt,
      meta,
    },
  };
}

/**
 * Height-stuck: height unchanged for NODE_HEIGHT_STUCK_MS.
 * Resets `since` when height advances.
 */
function evalHeightStuck(
  sub: TgAlertSubscription,
  height: number | null,
  now: number
): Desired | null {
  if (height == null) return null;
  const key = "node.height_stuck";
  const prev = sub.state[key];
  const prevH = prev?.meta?.height;

  if (prevH == null || prevH !== height) {
    // Height moved (or first sample) — healthy
    return {
      key,
      status: "ok",
      severity: "ok",
      title: "Node height advancing",
      body: [`Height ${height.toLocaleString()} — chain is moving.`],
      meta: { height },
    };
  }

  // Same height as last tick
  const since = prev?.since ?? now;
  if (now - since >= NODE_HEIGHT_STUCK_MS) {
    const mins = Math.round((now - since) / 60_000);
    return {
      key,
      status: "bad",
      severity: "warn",
      title: "Node height stuck",
      body: [
        `Full height stuck at ${height.toLocaleString()} for ~${mins} min.`,
        "Node may be stalled, isolated, or waiting on peers.",
        "Check logs / peers / disk.",
      ],
      meta: { height },
    };
  }

  return {
    key,
    status: "ok",
    severity: "ok",
    title: "Node height stuck",
    body: [],
    meta: { height },
  };
}

export async function evaluateSubscription(
  sub: TgAlertSubscription
): Promise<{ sent: number; checked: number; error?: string }> {
  const token = decryptToken(sub.tokenEnc);
  if (!token) {
    touchSubTick(sub.id, { lastError: "decrypt_failed" });
    return { sent: 0, checked: 0, error: "decrypt_failed" };
  }

  const now = Date.now();
  let sent = 0;
  let checked = 0;
  const desiredList: Desired[] = [];

  // --- Bridge ---
  const br = await probeBridge(token);
  checked += 1;
  if (sub.scopes.node || sub.scopes.oracle) {
    if (!br.connected) {
      desiredList.push({
        key: "bridge.offline",
        status: "bad",
        severity: "critical",
        title: "Bridge offline",
        body: [
          "Your Lumen Bridge agent is not connected.",
          br.error ? `Detail: ${br.error}` : "Check Docker / agent process.",
          "Open Mini App → Bridge → run agent next to your node.",
        ],
      });
      desiredList.push({
        key: "bridge.online",
        status: "bad",
        severity: "ok",
        title: "Bridge online",
        body: [],
      });
    } else {
      desiredList.push({
        key: "bridge.offline",
        status: "ok",
        severity: "ok",
        title: "Bridge offline",
        body: [],
      });
      desiredList.push({
        key: "bridge.online",
        status: "ok",
        severity: "ok",
        title: "Bridge back online",
        body: [
          "Your Bridge agent is connected again.",
          br.version ? `Version: ${br.version}` : "",
        ].filter(Boolean),
      });
    }
  }

  // --- Node (My Node via bridge) ---
  if (sub.scopes.node && br.connected) {
    const node = await probeNode(token);
    checked += 1;
    const minPeers = Math.max(0, sub.prefs.minPeers ?? 3);

    if (!node.ok) {
      desiredList.push({
        key: "node.unreachable",
        status: "bad",
        severity: "critical",
        title: "Node unreachable",
        body: [
          "Bridge is online, but Ergo node /info failed.",
          node.error ? `Detail: ${node.error}` : "Is the node process up?",
          "Check LUMEN_NODE URL and node REST port (9053).",
        ],
      });
      desiredList.push({
        key: "node.online",
        status: "bad",
        severity: "ok",
        title: "Node online",
        body: [],
      });
    } else {
      desiredList.push({
        key: "node.unreachable",
        status: "ok",
        severity: "ok",
        title: "Node unreachable",
        body: [],
      });
      desiredList.push({
        key: "node.online",
        status: "ok",
        severity: "ok",
        title: "Node back online",
        body: [
          node.name ? `Node: ${node.name}` : "Ergo node is responding.",
          node.fullHeight != null
            ? `Height: ${node.fullHeight.toLocaleString()}`
            : "",
          node.peersCount != null ? `Peers: ${node.peersCount}` : "",
        ].filter(Boolean),
      });

      // Peers low
      if (node.peersCount != null) {
        if (node.peersCount < minPeers) {
          desiredList.push({
            key: "node.peers_low",
            status: "bad",
            severity: "warn",
            title: "Node peers low",
            body: [
              `Only ${node.peersCount} P2P peer(s) (min ${minPeers}).`,
              "Node may struggle to stay in sync.",
              "Check firewall / known peers / public IP.",
            ],
            meta: { peers: node.peersCount, height: node.fullHeight },
          });
        } else {
          desiredList.push({
            key: "node.peers_low",
            status: "ok",
            severity: "ok",
            title: "Node peers restored",
            body: [
              `Peers OK: ${node.peersCount} (min ${minPeers}).`,
            ],
            meta: { peers: node.peersCount, height: node.fullHeight },
          });
        }
      }

      // Sync lag: headers vs full, and vs lumen tip
      const full = node.fullHeight;
      const headers = node.headersHeight;
      let lagBad = false;
      const lagBody: string[] = [];
      if (
        full != null &&
        headers != null &&
        headers - full >= NODE_HEADER_LAG_BLOCKS
      ) {
        lagBad = true;
        lagBody.push(
          `Syncing: full ${full.toLocaleString()} / headers ${headers.toLocaleString()} (Δ ${headers - full}).`
        );
      }
      const lumenTip = await probeLumenTip();
      if (
        full != null &&
        lumenTip != null &&
        lumenTip - full >= NODE_NETWORK_LAG_BLOCKS
      ) {
        lagBad = true;
        lagBody.push(
          `Behind network tip: node ${full.toLocaleString()} · network ~${lumenTip.toLocaleString()} (Δ ${lumenTip - full}).`
        );
      }
      if (lagBad) {
        desiredList.push({
          key: "node.sync_lag",
          status: "bad",
          severity: "warn",
          title: "Node sync lag",
          body: [
            ...lagBody,
            "Wait for catch-up or check disk / peers / CPU.",
          ],
          meta: { height: full, headers },
        });
      } else if (full != null) {
        desiredList.push({
          key: "node.sync_lag",
          status: "ok",
          severity: "ok",
          title: "Node sync recovered",
          body: [
            `Height ${full.toLocaleString()} is in range again.`,
          ],
          meta: { height: full, headers },
        });
      }

      // Height stuck
      const stuck = evalHeightStuck(sub, full, now);
      if (stuck) desiredList.push(stuck);
    }
  }

  // --- Oracle ---
  if (sub.scopes.oracle && br.connected) {
    const orc = await probeOraclesDetailed(token);
    checked += 1;
    if (orc.error && orc.feeds.length === 0) {
      touchSubTick(sub.id, { lastError: orc.error });
    }
    const lagThreshold = sub.prefs.postLagBlocks || 24;
    for (const f of orc.feeds) {
      if (f.isHealthy === false) {
        desiredList.push({
          key: `oracle.agent_down:${f.id}`,
          status: "bad",
          severity: "critical",
          title: `Oracle · ${f.pair}`,
          body: [
            "Agent DOWN — not posting.",
            f.postAgeBlocks != null
              ? `Last post age: ${f.postAgeBlocks} blocks`
              : "Last post: unknown",
            f.claimable != null
              ? `Claimable: ${f.claimable.toLocaleString()}`
              : "",
          ].filter(Boolean),
        });
      } else if (f.isHealthy === true) {
        desiredList.push({
          key: `oracle.agent_down:${f.id}`,
          status: "ok",
          severity: "ok",
          title: `Oracle · ${f.pair}`,
          body: ["Agent healthy again."],
        });
      }

      if (
        f.postAgeBlocks != null &&
        f.postAgeBlocks > Math.max(lagThreshold, f.liveMax)
      ) {
        desiredList.push({
          key: `oracle.post_lag:${f.id}`,
          status: "bad",
          severity: "warn",
          title: `Oracle lag · ${f.pair}`,
          body: [
            `Last publish was ${f.postAgeBlocks} blocks ago.`,
            `Threshold: ${Math.max(lagThreshold, f.liveMax)} blocks.`,
            "Check oracle-core / data sources.",
          ],
        });
      } else if (f.postAgeBlocks != null) {
        desiredList.push({
          key: `oracle.post_lag:${f.id}`,
          status: "ok",
          severity: "ok",
          title: `Oracle lag · ${f.pair}`,
          body: [],
        });
      }

      // Low gas
      if (f.walletErg != null && f.walletErg < 0.5) {
        desiredList.push({
          key: `oracle.low_gas:${f.id}`,
          status: "bad",
          severity: "warn",
          title: `Low gas · ${f.pair}`,
          body: [
            `Wallet has ${f.walletErg.toFixed(3)} ERG.`,
            "Top up for posting fees or agent may stop.",
          ],
        });
      } else if (f.walletErg != null) {
        desiredList.push({
          key: `oracle.low_gas:${f.id}`,
          status: "ok",
          severity: "ok",
          title: `Low gas · ${f.pair}`,
          body: [],
        });
      }

      // Missed last pool refresh
      if (f.inLastRefresh === false) {
        desiredList.push({
          key: `oracle.missed_refresh:${f.id}`,
          status: "bad",
          severity: "warn",
          title: `Missed refresh · ${f.pair}`,
          body: [
            "Your datapoint was not taken into the latest pool box.",
            "Check post timing / pool epoch.",
          ],
        });
      } else if (f.inLastRefresh === true) {
        desiredList.push({
          key: `oracle.missed_refresh:${f.id}`,
          status: "ok",
          severity: "ok",
          title: `Missed refresh · ${f.pair}`,
          body: [],
        });
      }
    }
  }

  // Apply edges + notify
  for (const d of desiredList) {
    // Height stuck: when still ok but height same, preserve `since` if meta matches
    if (
      d.key === "node.height_stuck" &&
      d.status === "ok" &&
      d.meta?.height != null
    ) {
      const prev = sub.state[d.key];
      if (prev?.meta?.height === d.meta.height && prev.status === "ok") {
        // keep since (don't reset)
        updateSubState(
          sub.id,
          d.key,
          {
            status: "ok",
            since: prev.since,
            lastNotifiedAt: prev.lastNotifiedAt,
            meta: d.meta,
          },
          { lastTickAt: new Date(now).toISOString(), lastError: null }
        );
        sub.state[d.key] = {
          status: "ok",
          since: prev.since,
          lastNotifiedAt: prev.lastNotifiedAt,
          meta: d.meta,
        };
        continue;
      }
    }

    const edge = applyEdge(sub, d, now);
    // Height first-sample / height-changed: force since=now
    if (
      d.key === "node.height_stuck" &&
      d.meta?.height != null &&
      (sub.state[d.key]?.meta?.height !== d.meta.height ||
        !sub.state[d.key])
    ) {
      edge.next.since = now;
      edge.next.meta = d.meta;
    }

    updateSubState(sub.id, d.key, edge.next, {
      lastTickAt: new Date(now).toISOString(),
      lastError: null,
    });
    sub.state[d.key] = edge.next;

    if (!edge.notify) continue;

    const isRecovery =
      d.status === "ok" &&
      d.body.length > 0 &&
      (d.key === "bridge.online" ||
        d.key === "node.online" ||
        d.key === "node.height_stuck" ||
        d.key === "node.peers_low" ||
        d.key === "node.sync_lag" ||
        d.key.startsWith("oracle."));
    const isBad = d.status === "bad";
    if (!isBad && !isRecovery) continue;

    const ok = await sendAlert(sub.chatId, d);
    if (ok) {
      sent += 1;
      const st = { ...edge.next, lastNotifiedAt: now };
      updateSubState(sub.id, d.key, st);
      sub.state[d.key] = st;
    }
  }

  touchSubTick(sub.id, { lastError: null });
  return { sent, checked };
}

export async function runAlertTick(): Promise<{
  ok: true;
  subs: number;
  checked: number;
  sent: number;
  errors: string[];
}> {
  const subs = listEnabledSubs();
  let checked = 0;
  let sent = 0;
  const errors: string[] = [];

  for (const sub of subs) {
    try {
      const r = await evaluateSubscription(sub);
      checked += r.checked;
      sent += r.sent;
      if (r.error) errors.push(`${sub.id}:${r.error}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "tick_error";
      errors.push(`${sub.id}:${msg}`);
      touchSubTick(sub.id, { lastError: msg });
    }
  }

  return { ok: true, subs: subs.length, checked, sent, errors };
}

export async function sendTestAlert(chatId: number): Promise<boolean> {
  const res = await tgApi("sendMessage", {
    chat_id: chatId,
    text: [
      "✅ <b>Lumen alerts armed</b>",
      "",
      "<b>Node</b>",
      "• Bridge offline / back online",
      "• Node unreachable",
      "• Peers too low",
      "• Sync lag (headers / network tip)",
      "• Height stuck ~30 min",
      "",
      "<b>Oracle</b>",
      "• Agent DOWN / recovered",
      "• Publish lag",
      "• Missed pool refresh",
      "• Low gas ERG",
      "",
      "<i>Mute: /alerts off · Mini App → Alerts</i>",
    ].join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  return !!res.ok;
}
