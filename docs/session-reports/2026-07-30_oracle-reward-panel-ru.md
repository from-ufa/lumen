# Отчёт: Oracles — On-chain price + Reward token

**Ветка:** `feat/oracle-reward-panel`  
**Дата:** 2026-07-30  

---

## Что сделано

Под каждым пулом (ERG/USD и ERG/XAU) ряд **On-chain price** разделён на **две равные панели**:

| Панель | Содержание |
|--------|------------|
| **On-chain price** | Цена пула, unit, alt |
| **Reward token** | Тикер (DORT / GORT), имя, spot (ERG + USD), **Operators income** (сумма claimable × цена), остаток в pool box; в My Oracle — Your claimable |

### Данные

- **DORT** — reward token ERG/USD pool  
- **GORT** — reward token ERG/XAU pool  
- Остаток токенов: explorer assets + metrics  
- Spot: Spectrum AMM (ERG/token), USD через ERG/USD pool  
- Operators income: сумма `rewardTokens` / claimable по всем операторам из metrics  

---

## Как проверить

1. `/oracles` — под картой каждого пула две плитки рядом  
2. DORT/GORT, цена, Operators income заполнены (не «—»)  
3. MY ORACLE — строка **Your claimable**  
