# Session report: idle oracle key holders (red) on constellation

**Дата:** 2026-07-29  
**HEAD:** `f903af8`  
**Промпт:** показать всех, кто получил oracle keys; idle — красные; описание «ключи есть, но не работают»

---

## 1. Что сделано

### Backend (`lib/oracles.ts`)

- Парсим `ergo_oracle_all_oracle_box_height` + `all_oracle_claimable_rewards` (полный roster key holders)
- Плюс `active_oracle_*` (кто сейчас постит)
- Не в active → `idleKey: true`, `status: offline`, `detail: "Keys held · not posting"`
- Live/stale из active — зелёные/жёлтые, `detail: "Posting"` / `"Lagging"`

### Constellation (`OracleConstellation.tsx`)

- Idle keys: **красные** (`#EF4444`), soft glow + ring, outer orbit, slow spin
- Tooltip: **Keys held · not posting** · Status: Idle key
- Hover label: `keys · idle`

### Dashboard panel (`OracleOperatorsLive.tsx`)

- Grid = all key holders
- Red badge **IDLE** / IDLE KEY
- Hint: Red = keys held · not posting

---

## 2. Live numbers (after deploy)

| Pool | total nodes | live | idle keys |
|------|-------------|------|-----------|
| ERG/USD | 18 | 12 | 6 |
| ERG/XAU | 20 | 12 | 8 |

`/oracles` → **200**

---

## 3. Commits

```
f903af8 feat(oracles): show all key holders; idle keys red on constellation
```

Files: `lib/oracles.ts`, `app/oracles/components/types.ts`, `OracleConstellation.tsx`, `OracleOperatorsLive.tsx`

---

## 4. Notes / limits

- Roster = what **oracle-core metrics** know as all_oracle_* (key holders seen by protocol), not a full historical NFT transfer census from genesis.
- If metrics miss a brand-new transfer not yet indexed by oracle-core, it won't appear until metrics see it.

---

## 5. Rollback

```bash
git revert f903af8
npm run build && systemctl restart lumen
```
