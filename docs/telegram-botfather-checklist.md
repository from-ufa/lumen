# Чеклист: что сделать в Telegram (BotFather)

Мини-приложение открывает **https://ergolumen.net**.  
Код на ветке `feat/telegram-miniapp` — на **production** заработает после merge + token + restart (это делает агент/сервер по вашей команде).

---

## Часть A — только вы в Telegram (BotFather)

### 1. Создать бота

1. Откройте Telegram → найдите **@BotFather**
2. Отправьте: `/newbot`
3. **Имя** (как видно людям), например: `Lumen`
4. **Username** (обязан заканчиваться на `bot`), например: `ergolumen_bot`
5. BotFather пришлёт **token** вида:
   ```text
   7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
6. **Скопируйте token** и сохраните (пароль бота — никому в чат/git)

### 2. Описание (по желанию)

В @BotFather:

- `/setdescription` → коротко:  
  `Ergo node dashboard — Orbit, Map, Oracles, Bridge`
- `/setabouttext` → то же короче
- `/setuserpic` → иконка (квадрат, лучше тёмная)

### 3. Команды меню бота

1. `/setcommands`
2. Выберите вашего бота
3. Вставьте **одним сообщением**:

```text
start - Open Lumen Mini App
app - Open dashboard
status - Node height and peers
oracles - ERG/USD and ERG/XAU
help - List commands
```

### 4. Кнопка Menu → Mini App (главное)

**Вариант A (рекомендуется):**

1. `/setmenubutton`
2. Выберите бота
3. Текст кнопки, например: `Open Lumen`
4. URL (строго HTTPS):

```text
https://ergolumen.net
```

**Вариант B (если BotFather предлагает Configure Mini App):**

1. Bot Settings → Configure Mini App / Main Mini App  
2. URL: `https://ergolumen.net`  
3. (Опционально) short name для `t.me/bot/appname` — не обязательно для Phase 1

> URL **должен** быть `https://ergolumen.net` (или ваш домен).  
> Не `http://`, не IP без TLS.

### 5. Domain для Web App (если спросит)

Если BotFather / Telegram просит domain allowlist:

```text
ergolumen.net
```

### 6. Deep links (просто сохраните себе)

После того как username бота известен (пример `ergolumen_bot`):

| Ссылка | Куда откроет |
|--------|----------------|
| `https://t.me/ergolumen_bot?startapp` | Dashboard |
| `https://t.me/ergolumen_bot?startapp=oracles` | Oracles |
| `https://t.me/ergolumen_bot?startapp=orbit` | Orbit 3D |
| `https://t.me/ergolumen_bot?startapp=map` | World Map |
| `https://t.me/ergolumen_bot?startapp=settings` | Settings |

Замените `ergolumen_bot` на **ваш** username.

### 7. Что **не** нужно в BotFather для Phase 1

- Payments / Stars  
- Login Widget отдельно  
- Groups privacy (если бот только для вас — можно `/setjoingroups` disable)  
- Webhook в BotFather вручную — webhook ставится **curl с сервера** после деплоя  

---

## Часть B — что передать на сервер (вам)

Пришлите **агенту** или положите сами в `/home/lumen/.env.local` (не в git, не в чат публично):

```bash
TELEGRAM_BOT_TOKEN=<token из BotFather>
TELEGRAM_WEBAPP_URL=https://ergolumen.net
```

Опционально (можно сгенерировать длинные случайные строки):

```bash
TELEGRAM_WEBHOOK_SECRET=<случайная_строка_32+_символа>
TELEGRAM_SESSION_SECRET=<другая_случайная_строка>
```

---

## Часть C — что сделать на сервере (агент по вашей команде)

Порядок **после** того, как token у вас есть:

1. Merge `feat/telegram-miniapp` → `main`  
2. Записать env в `.env.local`  
3. `npm run build` + `systemctl restart lumen`  
4. Повесить webhook:

```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://ergolumen.net/api/tg/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
```

5. Проверка:

```bash
curl -sS https://ergolumen.net/api/tg/status
# botConfigured: true
```

6. В Telegram: открыть бота → **/start** → кнопка **Open Lumen** → должна открыться Mini App.

---

## Порядок «что делать прямо сейчас» (коротко)

| # | Кто | Действие |
|---|-----|----------|
| 1 | **Вы** | @BotFather → `/newbot` → сохранить token |
| 2 | **Вы** | `/setcommands` (список выше) |
| 3 | **Вы** | `/setmenubutton` → URL `https://ergolumen.net` |
| 4 | **Вы** | Передать token на сервер (env) — **не** коммитить |
| 5 | **Вы** | Написать: «мержи и деплой TG» |
| 6 | **Агент** | merge + env + build + restart + setWebhook |
| 7 | **Вы** | Тест: /start → Open Lumen на телефоне |

---

## Частые ошибки

| Ошибка | Почему |
|--------|--------|
| Кнопка открывает сайт, но «не Mini App» | URL не HTTPS или не тот domain |
| /start молчит | webhook не поставлен или ветка не задеплоена |
| auth 503 | нет `TELEGRAM_BOT_TOKEN` на сервере |
| Basic Auth мешает | Public Mode пароль + нет валидного initData (нужен token + deploy) |

---

См. также: [telegram.md](./telegram.md)
