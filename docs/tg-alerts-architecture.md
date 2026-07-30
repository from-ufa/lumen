# Lumen · Telegram Alerts Architecture

**Status:** design (not implemented)  
**Date:** 2026-07-30  
**Depends on:** TG Mini App Phase 1 (live), Bridge token, oracle metrics  

---

## 1. Проблема

Сейчас бот умеет:

- открыть Mini App (`/start`, web_app);
- по запросу `/status` / `/oracles` отдать **публичный** снимок.

Не умеет:

- знать, **чей** это node/oracle;
- слать **личные** push-уведомления в Telegram;
- следить за bridge-агентом оператора.

Нужно: человек, который зашёл через бота и подключил **свой** node и/или **свой** oracle, получает **только свои** алерты.

---

## 2. Принципы (изящество)

| # | Принцип | Смысл |
|---|---------|--------|
| 1 | **Opt-in only** | Без явного «включить оповещения» — тишина |
| 2 | **Identity = Bridge token + TG user** | Не шлём «всем оракулам»; только тем, кто доказал владение через bridge |
| 3 | **State machine, not spam** | Алерт на **переход** bad→ok / ok→bad, не на каждый poll |
| 4 | **One voice** | Единый формат сообщений, deep-link в Mini App |
| 5 | **Cheap loop** | Один watchdog, reuse существующих `/api/bridge/*` + oracle metrics |
| 6 | **Privacy** | В store — `chatId` + **hash** bridge token, не сырой token в логах |

---

## 3. Что уже есть (reuse)

```text
Telegram user
  ├─ Mini App → POST /api/tg/auth (HMAC initData → userId + cookie)
  ├─ Bot webhook → chatId (private chat: chatId ≈ userId)
  ├─ Bridge token (lumen_*) → My Node / My Oracle
  │     bridge online?  GET /api/bridge/status?token=
  │     node info       via bridge proxy
  │     oracle metrics  via bridge / host metrics
  └─ Bot API sendMessage (app/lib/tg-bot.ts)  ✅ already
```

| Сигнал | Источник | Уже в коде |
|--------|----------|------------|
| Bridge online / offline | bridge server `/status` | ✅ |
| Node height / peers | bridge → node `/info`, `/peers` | ✅ |
| Oracle healthy | `myOperator.isHealthy` | ✅ |
| Post lag / in refresh | `postAgeBlocks`, `inLastRefresh` | ✅ |
| Claimable DORT/GORT | `claimableRewards` | ✅ |
| Low gas ERG | `walletErg` | ✅ |
| TG sendMessage | `tg-bot.ts` | ✅ |
| iOS push stub | `data/push-tokens.json` | ✅ pattern for file store |

---

## 4. Модель данных

### 4.1 Subscription (одна запись = один TG-пользователь)

```ts
type TgAlertSubscription = {
  id: string;                    // short id
  tgUserId: number;              // from initData
  chatId: number;                // from bot (DM)
  /** sha256 of bridge token — link to "their" agent */
  bridgeTokenHash: string;
  /** optional label: "home-node", "usd-oracle" */
  label?: string;

  scopes: {
    node: boolean;               // alerts about Ergo node
    oracle: boolean;             // alerts about oracle agent(s)
  };

  prefs: {
    enabled: boolean;
    /** local quiet window, default 23:00–08:00 user TZ or UTC */
    quietHours?: { from: string; to: string; tz?: string } | null;
    claimReminder: boolean;      // daily claim nudge
    claimMinTokens: number;      // e.g. 100
    minPeers: number;            // default 3
    /** minutes before "post lag" fires */
    postLagBlocks: number;       // default = feed liveMax
  };

  /** last known evaluated state per alert key — for edge detection */
  state: Record<string, {
    status: "ok" | "bad" | "unknown";
    since: number;               // ms
    lastNotifiedAt: number | null;
    lastDigestAt?: number | null;
  }>;

  createdAt: string;
  updatedAt: string;
  lastTickAt?: string;
};
```

**Store (Phase A):** `data/tg-alert-subs.json` (mode `0600`), pattern like `push-tokens.json`.  
**Later:** SQLite if volume grows.

### 4.2 Alert catalog (закрытый список)

| key | Scope | Severity | Trigger (edge) | Cooldown | Message idea |
|-----|-------|----------|----------------|----------|--------------|
| `bridge.offline` | both | critical | bridge was online → offline > 2 min | 30 min | Bridge disconnected |
| `bridge.online` | both | ok | offline → online | 10 min | Bridge back |
| `node.unreachable` | node | critical | cannot fetch info | 30 min | Node not responding |
| `node.peers_low` | node | warn | peers < minPeers | 2 h | Only N peers |
| `node.sync_lag` | node | warn | headers << network tip | 1 h | Sync lag |
| `node.height_stuck` | node | warn | height unchanged > 30 min | 2 h | Height stuck |
| `oracle.agent_down` | oracle | critical | isHealthy false | 30 min | Oracle agent DOWN |
| `oracle.post_lag` | oracle | warn | postAge > threshold | 1 h | Not posting |
| `oracle.missed_refresh` | oracle | warn | inLastRefresh false for 2+ epochs | 1 h | Missed pool refresh |
| `oracle.low_gas` | oracle | warn | walletErg < 0.5 | 12 h | Low ERG for fees |
| `oracle.claim_ready` | oracle | info | claimable ≥ min **and** daily slot | **1 / day** | Time to claim rewards |

---

## 5. Архитектура (потоки)

```text
┌─────────────────────────────────────────────────────────────┐
│                     OPT-IN (human)                          │
│  Mini App → Settings → «Telegram alerts»                    │
│    or bot: /alerts on | /alerts off | /alerts status        │
│         │                                                   │
│         ▼                                                   │
│  POST /api/tg/alerts/subscribe                              │
│    cookie lumen_tg_auth (userId)                            │
│    + bridgeToken (proves agent)                             │
│    + scopes/prefs                                           │
│         │                                                   │
│         ▼                                                   │
│  data/tg-alert-subs.json                                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              WATCHDOG (server, every ~60–90s)               │
│  Internal: GET /api/tg/alerts/tick  (secret header)         │
│  or systemd timer → curl localhost                          │
│                                                             │
│  for each enabled sub:                                      │
│    1. resolve live signals via bridge token                 │
│    2. evaluate catalog rules → desired status               │
│    3. if edge OR scheduled (claim_ready):                   │
│         rate-limit + quiet-hours → sendMessage              │
│    4. persist state                                         │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
              Telegram Bot API → private chat
              [Open dashboard] web_app button
```

### 5.1 Почему не «push из bridge»?

Bridge уже шлёт heartbeat на server. Можно позже **event-driven** `bridge.offline` с сервера bridge.  
Phase 1: **poll subscriptions** — проще, надёжнее, не трогает bridge protocol.  
Phase 2: optional hook from bridge server on disconnect → faster critical path.

### 5.2 Watchdog placement

| Option | Pros | Cons |
|--------|------|------|
| **A. Next route + systemd timer** | simple, restart-safe | extra unit |
| **B. In-process `setInterval` in Node** | no timer unit | dies with process; drift |
| **C. Separate small worker** | clean | more ops |

**Recommend A:** `lumen-tg-alerts.timer` every 1 min →  
`curl -H "X-Lumen-Internal: $SECRET" http://127.0.0.1:3000/api/tg/alerts/tick`

---

## 6. UX (красиво и понятно)

### 6.1 Mini App — блок «Alerts» в Connection Settings

```
┌ Telegram alerts ─────────────────────┐
│  ● Enabled for this bridge           │
│                                      │
│  ☑ Node problems                     │
│  ☑ Oracle problems                   │
│  ☑ Daily claim reminder              │
│                                      │
│  Quiet hours  23:00 – 08:00          │
│                                      │
│  Last check · 40s ago · all clear    │
│  [ Test alert ]                      │
└──────────────────────────────────────┘
```

- Показывать **только** если user в TG Mini App **или** уже есть binding.
- «Test alert» → одно сообщение «Lumen alerts connected ✓».

### 6.2 Bot commands

```
/alerts          — status + toggles hint
/alerts on       — enable (if subscription exists)
/alerts off      — mute all
/alerts claim on|off
/alerts test
```

Deep link from alert message:

```
[ Open My Oracle ]  web_app → /oracles
[ Open My Node ]    web_app → /?tg=settings
```

### 6.3 Message tone (единый шаблон)

```
⚠️  Oracle · ERG/USD
Agent DOWN — not posting

Last post: 42 blk ago
Claimable: 1,204 DORT

Open Lumen → check bridge & agent
[ Open Oracles ]
```

Recovery:

```
✅  Oracle · ERG/USD
Back online — healthy

You were offline ~18 min
```

---

## 7. Правила анти-спама

1. **Edge-only** для critical/warn (кроме claim schedule).  
2. **Cooldownup key:** `subId:alertKey:feedId` — не слать повтор, пока status=bad, чаще cooldown.  
3. **Escalation (optional later):** 2h / 6h / 24h digests while still bad.  
4. **Quiet hours:** buffer non-critical; critical (bridge/agent down) — optional override flag `breakQuiet: true`.  
5. **Global cap:** max ~20 messages / user / day.  
6. **Claim:** at most 1/day, only if claimable ≥ threshold, preferred local morning hour.

---

## 8. Безопасность

| Risk | Mitigation |
|------|------------|
| Чужой token → чужие алерты | Subscribe only with **validated TG session** + token that **actually connects** (probe bridge status 200) |
| Token leak in DB | Store **hash only**; runtime needs raw token → encrypt at rest with `TELEGRAM_SESSION_SECRET` or re-enter token once |
| **Raw token storage** | Phase A: encrypted blob (AES-GCM, key from env). Phase B: bridge server issues short-lived alert channel id |
| Webhook spam | existing secret header |
| Tick abuse | internal secret header, localhost only |
| PII | no logging of full addresses in message logs; truncate |

**Token storage nuance:** watchdog must call APIs with the real bridge token. Options:

1. **Encrypt token** in subscription (`tokenEnc`) — practical Phase 1.  
2. **Server-side map** bridgeTokenHash → token only in bridge-server memory (harder).  
3. **User re-auth** each session — bad UX for background alerts.

→ **Phase 1: AES-GCM encrypted token in sub file.**

---

## 9. Phased delivery

### Phase TA-1 — Foundation (1–2 days)

- [ ] `data/tg-alert-subs.json` + lib store  
- [ ] `POST /api/tg/alerts/subscribe` · `DELETE` · `GET status`  
- [ ] Bind `chatId` on next bot message / or from Mini App if user pressed Start  
- [ ] Encrypt bridge token  
- [ ] Tick endpoint + systemd timer  
- [ ] Alerts: `bridge.offline/online`, `oracle.agent_down`, `oracle.post_lag`  
- [ ] Bot: `/alerts`, test message  
- [ ] Mini App toggle (minimal)

### Phase TA-2 — Node + claim

- [ ] Node: unreachable, peers_low, height_stuck  
- [ ] `oracle.claim_ready` daily  
- [ ] `oracle.low_gas`, `oracle.missed_refresh`  
- [ ] Quiet hours + cooldowns polish  
- [ ] Beautiful Settings UI panel  

### Phase TA-3 — Delight

- [ ] Recovery messages  
- [ ] Digest «daily brief» optional  
- [ ] Bridge server disconnect hook (faster offline)  
- [ ] Same catalog → future APNs (share alert engine)

---

## 10. API sketch

```http
POST /api/tg/alerts/subscribe
Cookie: lumen_tg_auth
Body: {
  "bridgeToken": "lumen_…",
  "chatId": 123456789,          // optional if already known
  "scopes": { "node": true, "oracle": true },
  "prefs": { "claimReminder": true, "claimMinTokens": 100 }
}
→ { ok, id, scopes }

GET /api/tg/alerts/me
→ { ok, subscription | null, lastAlerts: [...] }

POST /api/tg/alerts/test
→ sends one TG message

POST /api/tg/alerts/tick
Header: X-Lumen-Internal: <secret>
→ { ok, checked, sent, skipped }
```

---

## 11. Почему это «изящно»

1. **Один identity graph:** TG user ↔ bridge token ↔ node/oracle — без отдельной регистрации email.  
2. **Один alert engine** для TG сейчас и APNs потом (тот же catalog + tick).  
3. **Не спамит:** state edges + cooldowns + quiet hours.  
4. **Не ломает публичный сайт:** всё opt-in, file store, env-gated.  
5. **Reuse 90% сигналов**, которые уже крутятся в My Node / My Oracle cockpit.

---

## 12. Риски / открытые решения

| Question | Recommendation |
|----------|----------------|
| Где взять chatId, если user только Mini App и никогда не писал боту? | Mini App: `Telegram.WebApp.openTelegramLink` / requestWriteAccess (Bot API 6.9+) **или** soft prompt «Send /start to enable push» |
| Несколько bridge tokens у одного user? | 1 sub per token; UI list |
| Host-only oracles (no bridge)? | Alerts **only** for bridge-attached agents (честная ownership) |
| Public network issues? | Не слать «pool DOWN» всем — только **your** agent metrics |

---

## 13. Next step (when you say go)

Implement **Phase TA-1** only: subscribe + tick + bridge/oracle critical alerts + bot commands + minimal UI toggle.

No code until explicit command.
