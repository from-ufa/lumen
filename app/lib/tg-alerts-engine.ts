/**
 * TA-1 alert engine: probe bridge/oracle signals → edge notify via Bot API.
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
  "oracle.agent_down": 30 * 60_000,
  "oracle.post_lag": 60 * 60_000,
};

type Desired = {
  key: string;
  status: "ok" | "bad";
  severity: "critical" | "warn" | "ok";
  title: string;
  body: string[];
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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

async function probeOraclesDetailed(token: string): Promise<{
  feeds: Array<{
    id: string;
    pair: string;
    isHealthy: boolean | null;
    postAgeBlocks: number | null;
    claimable: number | null;
    liveMax: number;
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
  const cd = COOLDOWN_MS[key.split(":")[0]] ?? COOLDOWN_MS[key] ?? 30 * 60_000;
  // keys like oracle.agent_down:erg-usd
  const base = key.includes(":") ? key.split(":")[0] : key;
  const ms = COOLDOWN_MS[base] ?? cd;
  return now - prev.lastNotifiedAt >= ms;
}

async function sendAlert(
  chatId: number,
  d: Desired
): Promise<boolean> {
  const icon =
    d.severity === "critical" ? "⚠️" : d.severity === "warn" ? "⚡" : "✅";
  const html = [
    `${icon} <b>${esc(d.title)}</b>`,
    "",
    ...d.body.map((l) => esc(l)),
    "",
    "<i>Lumen alerts · TA-1</i>",
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

  // First observation: seed state, only notify on bad
  if (!prev || prevStatus === "unknown") {
    const notify = nextStatus === "bad" && cooldownOk(prev, desired.key, now);
    return {
      notify,
      next: {
        status: nextStatus,
        since: now,
        lastNotifiedAt: notify ? now : prev?.lastNotifiedAt ?? null,
      },
    };
  }

  if (prevStatus === nextStatus) {
    // Still bad — cooldown re-notify optional; TA-1: no spam while stuck bad
    return {
      notify: false,
      next: {
        status: nextStatus,
        since: prev.since,
        lastNotifiedAt: prev.lastNotifiedAt,
      },
    };
  }

  // Edge: status changed
  const notify = cooldownOk(prev, desired.key, now);
  return {
    notify,
    next: {
      status: nextStatus,
      since: now,
      lastNotifiedAt: notify ? now : prev.lastNotifiedAt,
    },
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
          br.error ? `Detail: ${br.error}` : "Check Docker / node process.",
          "Open Mini App → Settings → reconnect agent.",
        ],
      });
      // When offline, mark online state as not-ok implicitly via edge on recovery
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

  // --- Oracle (only if connected + scope) ---
  if (sub.scopes.oracle && br.connected) {
    const orc = await probeOraclesDetailed(token);
    checked += 1;
    if (orc.error && orc.feeds.length === 0) {
      touchSubTick(sub.id, { lastError: orc.error });
    }
    const lagThreshold = sub.prefs.postLagBlocks || 24;
    for (const f of orc.feeds) {
      // Agent down
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

      // Post lag
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
    }
  }

  // Apply edges
  for (const d of desiredList) {
    // Skip empty recovery templates that aren't real recovery messages
    const edge = applyEdge(sub, d, now);
    updateSubState(sub.id, d.key, edge.next, {
      lastTickAt: new Date(now).toISOString(),
      lastError: null,
    });
    // Sync local sub.state for subsequent keys in same tick
    sub.state[d.key] = edge.next;

    if (!edge.notify) continue;

    // Only send human messages for meaningful content
    const isRecovery =
      d.status === "ok" &&
      (d.key === "bridge.online" || d.key.startsWith("oracle.agent_down"));
    const isBad = d.status === "bad";
    if (!isBad && !isRecovery) continue;
    if (isRecovery && d.body.length === 0) continue;

    // bridge.online only when recovering from bad offline
    if (d.key === "bridge.online" && d.status === "ok") {
      // already filtered by edge from bad→ok
    }

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
      "✅ <b>Lumen alerts connected</b>",
      "",
      "You will get private messages when:",
      "• Bridge goes offline / comes back",
      "• Oracle agent is DOWN",
      "• Oracle publish lag is high",
      "",
      "<i>Mute anytime: /alerts off</i>",
    ].join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  return !!res.ok;
}
