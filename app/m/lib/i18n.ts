/**
 * Mini App i18n — EN + RU.
 * Locale: localStorage override → Telegram language_code → navigator → en.
 */

export type MiniLocale = "en" | "ru";

export const LS_MINI_LOCALE = "lumen-mini-locale";

const EN = {
  // Tabs
  tab_home: "Home",
  tab_network: "Net",
  tab_oracles: "Ora",
  tab_me: "Me",
  nav_main: "Main",

  // Shell header
  source_my: "MY NODE",
  source_lumen: "NETWORK",
  status_live: "LIVE",
  status_off: "OFF",
  pull_refresh: "Pull to refresh",
  release_refresh: "Release to refresh",
  toast_bridge_restored: "Bridge restored",
  toast_token_cleared: "Token cleared",

  // Home
  source: "SOURCE",
  source_my_node: "MY NODE ›",
  source_lumen_node: "LUMEN ›",
  height: "HEIGHT",
  headers_sync: "Headers {h} · sync ~{p}%",
  peers: "Peers · {n}",
  mempool: "Mempool · {n}",
  avg_block: "Avg block · {v}",
  avg_sub_samples: "LAST {w} · {s} Δ",
  avg_sub_window: "LAST {w}",
  avg_sub_loading: "FROM NODE…",
  node: "Node · {n}",
  bridge_online: "Bridge · online",
  bridge_offline: "Bridge · offline",
  bridge_not_set: "Bridge · not set",
  action_refresh: "Refresh",
  action_bridge: "Bridge",
  action_alerts: "Alerts",
  action_oracles: "Oracles",
  empty_connect_title: "Connect your node",
  empty_connect_body:
    "Generate or paste a bridge token — no desktop site needed.",

  // Network
  network_title: "Network",
  map: "MAP",
  list: "LIST",
  search_peers: "Search name, city, IP…",
  filter_live: "LIVE",
  filter_all: "ALL",
  peers_count: "{n} peers · {f}",
  peers_count_q: "{n} / {total} peers · {f}",
  peers_loading: "Loading peers…",
  empty_peers_filter: "No peers in this filter",
  empty_peers_filter_body: "Try ALL or wait for the map to refresh.",
  empty_peers_search: "No peers match this search",
  empty_peers_search_body: "Clear the query or switch LIVE / ALL.",
  peer_unknown: "Unknown",
  peer_title: "Peer",
  peer_name: "Name",
  peer_place: "Place",
  peer_ip: "IP",
  peer_status: "Status",
  peer_link: "Link",
  peer_version: "Version",
  close: "CLOSE",

  // Oracles
  oracles_title: "Oracles",
  oracles_network: "NETWORK",
  oracles_my: "MY",
  empty_oracle_connect_title: "Connect bridge",
  empty_oracle_connect_body: "Your operator feeds need a bridge token.",
  agent: "AGENT",
  agent_online: "Bridge online",
  agent_offline: "Bridge offline / no data",
  empty_oracle_my: "No operator feeds yet",
  empty_oracle_my_body: "Enable oracle scope on the Bridge agent next to your node.",
  empty_oracle_net: "Oracle feeds unavailable",
  empty_oracle_net_body: "Pull to refresh or try again in a moment.",

  // Oracle feed cards
  ora_scope_you: "YOUR ORACLE",
  ora_scope_lumen: "LUMEN POOL",
  ora_pool_age: "Pool age",
  ora_quorum: "Quorum",
  ora_epoch: "Epoch",
  ora_pool_ok: "pool OK",
  ora_pool_bad: "pool bad",
  ora_reward_token: "Reward token",
  ora_op_day: "Operator / day",
  ora_if_collected: "if collected every epoch",
  ora_per_epoch: "Per epoch",
  ora_your_oracle: "Your oracle",
  ora_host_operator: "Host operator",
  ora_healthy: "HEALTHY",
  ora_down: "DOWN",
  ora_to_claim: "To claim",
  ora_in_wallet: "In wallet",
  ora_total_est: "Total est.",
  ora_held_plus_claim: "held+claim",
  ora_last_publish: "Last publish",
  ora_gas_wallet: "Gas wallet",
  ora_for_posting: "for posting txs",
  ora_in_refresh: "In last refresh",
  ora_yes: "YES",
  ora_no: "NO",
  ora_detail: "Detail",
  ora_no_operator_data:
    "No operator metrics yet — is the Bridge agent running with oracle scope and posting?",
  ora_explorer: "Explorer",
  ora_bridge_banner: "Bridge",
  ora_bridge_online: "Agent online",
  ora_bridge_offline: "Agent offline — showing network pools",
  ora_configured: "Configured: {list}",

  // Me
  me_title: "Me",
  bridge: "BRIDGE",
  token_status: "Token {t} · ",
  online: "online",
  offline: "offline",
  not_connected: "Not connected — tap to set up",
  mode_line: "Mode · {m}",
  mode_my: "My Node",
  mode_lumen: "lumen",
  alerts: "ALERTS",
  alerts_watchdog: "Telegram watchdog",
  alerts_watchdog_sub: "Bridge / oracle problem pings",
  open_site: "Open full site",
  open_site_sub: "Orbit · desktop cockpit · ergolumen.net",
  clear_token: "CLEAR TOKEN",
  language: "LANGUAGE",
  lang_en: "EN",
  lang_ru: "RU",

  // Bridge sheet
  bridge_sheet_title: "Bridge",
  bridge_source: "SOURCE",
  bridge_token_label: "BRIDGE TOKEN",
  generate: "GENERATE",
  save: "SAVE",
  run_next_to_node: "RUN NEXT TO YOUR ERGO NODE",
  docker_label: "DOCKER (RECOMMENDED)",
  docker_hint:
    "Linux host network · reaches Ergo on 127.0.0.1:9053. Paste on the machine that runs your node.",
  need_token_docker: "Generate or paste a token to unlock the Docker one-liner.",
  install_label: "INSTALL.SH (NO DOCKER)",
  install_hint: "curl install from GitHub, then use RUN below.",
  run_label: "RUN AGENT",
  run_hint: "After install.sh — same token as above.",
  bridge_footer:
    "Vault restore uses Telegram link flow. Keep the agent running next to your node for MY NODE mode.",
  copy: "COPY",
  copied: "COPIED",
  toast_copied: "Copied",
  toast_copy_failed: "Copy failed",
  toast_bridge_saved: "Bridge saved",
  toast_bridge_cleared: "Bridge token cleared",
  toast_token_created: "Token created — copy Docker cmd below",
  toast_mint_failed: "Mint failed",

  // Alerts sheet
  alerts_sheet_title: "Alerts",
  alerts_intro:
    "Private Telegram messages when bridge drops, recovers, or oracle looks unhealthy.",
  watchdog: "Watchdog",
  armed: "Armed",
  off: "Off",
  need_start: " · need /start",
  send_test: "SEND TEST",
  on: "ON",
  off_btn: "OFF",
  hint_save_token: "Save a bridge token first (Me → Bridge)",
  hint_bot_off: "Bot not configured on server",
  hint_auth: "Open Mini App from @ergolumen_bot so we can verify you",
  hint_load_fail: "Could not load alerts",
  hint_start_bot: "Send /start to @ergolumen_bot first",
  hint_watchdog_on: "Watchdog: bridge offline · oracle · lag",
  hint_opt_in: "Opt-in for private problem alerts",
  hint_network: "Network error",
  hint_enabled_test: "Enabled · test message sent",
  hint_alerts_on: "Alerts on",
  hint_muted: "Muted",
  toast_alerts_on: "Telegram alerts on",
  toast_could_enable: "Could not enable",
  toast_could_mute: "Could not mute",
  toast_alerts_muted: "Alerts muted",
  toast_test_sent: "Test sent",
  toast_test_failed: "Test failed",
  toast_network: "Network error",
  close_aria: "Close",
} as const;

export type MiniMsgKey = keyof typeof EN;

const RU: Record<MiniMsgKey, string> = {
  tab_home: "Дом",
  tab_network: "Сеть",
  tab_oracles: "Ора",
  tab_me: "Я",
  nav_main: "Меню",

  source_my: "МОЯ НОДА",
  source_lumen: "СЕТЬ",
  status_live: "LIVE",
  status_off: "OFF",
  pull_refresh: "Потяни для обновления",
  release_refresh: "Отпусти для обновления",
  toast_bridge_restored: "Bridge восстановлен",
  toast_token_cleared: "Токен очищен",

  source: "ИСТОЧНИК",
  source_my_node: "МОЯ НОДА ›",
  source_lumen_node: "LUMEN ›",
  height: "ВЫСОТА",
  headers_sync: "Заголовки {h} · sync ~{p}%",
  peers: "Пиры · {n}",
  mempool: "Mempool · {n}",
  avg_block: "Ср. блок · {v}",
  avg_sub_samples: "ПОСЛ. {w} · {s} Δ",
  avg_sub_window: "ПОСЛ. {w}",
  avg_sub_loading: "С НОДЫ…",
  node: "Нода · {n}",
  bridge_online: "Bridge · online",
  bridge_offline: "Bridge · offline",
  bridge_not_set: "Bridge · не задан",
  action_refresh: "Обновить",
  action_bridge: "Bridge",
  action_alerts: "Алерты",
  action_oracles: "Ораклы",
  empty_connect_title: "Подключи свою ноду",
  empty_connect_body:
    "Сгенерируй или вставь bridge-токен — без десктопного сайта.",

  network_title: "Сеть",
  map: "КАРТА",
  list: "СПИСОК",
  search_peers: "Имя, город, IP…",
  filter_live: "LIVE",
  filter_all: "ВСЕ",
  peers_count: "{n} пиров · {f}",
  peers_count_q: "{n} / {total} пиров · {f}",
  peers_loading: "Загрузка пиров…",
  empty_peers_filter: "Нет пиров в этом фильтре",
  empty_peers_filter_body: "Попробуй ВСЕ или дождись обновления карты.",
  empty_peers_search: "Ничего не найдено",
  empty_peers_search_body: "Очисти поиск или смени LIVE / ВСЕ.",
  peer_unknown: "Неизвестно",
  peer_title: "Пир",
  peer_name: "Имя",
  peer_place: "Место",
  peer_ip: "IP",
  peer_status: "Статус",
  peer_link: "Связь",
  peer_version: "Версия",
  close: "ЗАКРЫТЬ",

  oracles_title: "Ораклы",
  oracles_network: "СЕТЬ",
  oracles_my: "МОИ",
  empty_oracle_connect_title: "Подключи bridge",
  empty_oracle_connect_body: "Операторским фидам нужен bridge-токен.",
  agent: "АГЕНТ",
  agent_online: "Bridge online",
  agent_offline: "Bridge offline / нет данных",
  empty_oracle_my: "Пока нет operator feeds",
  empty_oracle_my_body:
    "Включи oracle scope у Bridge-агента рядом с нодой.",
  empty_oracle_net: "Фиды недоступны",
  empty_oracle_net_body: "Потяни для обновления или попробуй позже.",

  ora_scope_you: "ТВОЙ ORACLE",
  ora_scope_lumen: "ПУЛ LUMEN",
  ora_pool_age: "Возраст пула",
  ora_quorum: "Кворум",
  ora_epoch: "Эпоха",
  ora_pool_ok: "пул OK",
  ora_pool_bad: "пул bad",
  ora_reward_token: "Reward token",
  ora_op_day: "Оператор / день",
  ora_if_collected: "если в каждом epoch",
  ora_per_epoch: "За epoch",
  ora_your_oracle: "Твой oracle",
  ora_host_operator: "Оператор host",
  ora_healthy: "HEALTHY",
  ora_down: "DOWN",
  ora_to_claim: "Клейм",
  ora_in_wallet: "В кошельке",
  ora_total_est: "Всего ≈",
  ora_held_plus_claim: "held+claim",
  ora_last_publish: "Последний пост",
  ora_gas_wallet: "Gas-кошелёк",
  ora_for_posting: "на tx постинга",
  ora_in_refresh: "В last refresh",
  ora_yes: "ДА",
  ora_no: "НЕТ",
  ora_detail: "Деталь",
  ora_no_operator_data:
    "Нет метрик оператора — Bridge с oracle scope запущен и постит?",
  ora_explorer: "Explorer",
  ora_bridge_banner: "Bridge",
  ora_bridge_online: "Агент online",
  ora_bridge_offline: "Агент offline — показываем сетевые пулы",
  ora_configured: "Настроено: {list}",

  me_title: "Я",
  bridge: "BRIDGE",
  token_status: "Токен {t} · ",
  online: "online",
  offline: "offline",
  not_connected: "Не подключено — нажми для настройки",
  mode_line: "Режим · {m}",
  mode_my: "Моя нода",
  mode_lumen: "lumen",
  alerts: "АЛЕРТЫ",
  alerts_watchdog: "Telegram watchdog",
  alerts_watchdog_sub: "Пинги: bridge / oracle",
  open_site: "Полный сайт",
  open_site_sub: "Orbit · десктоп · ergolumen.net",
  clear_token: "ОЧИСТИТЬ ТОКЕН",
  language: "ЯЗЫК",
  lang_en: "EN",
  lang_ru: "RU",

  bridge_sheet_title: "Bridge",
  bridge_source: "ИСТОЧНИК",
  bridge_token_label: "BRIDGE TOKEN",
  generate: "СОЗДАТЬ",
  save: "СОХРАНИТЬ",
  run_next_to_node: "ЗАПУСК РЯДОМ С ERGO-НОДОЙ",
  docker_label: "DOCKER (РЕКОМЕНДУЕМ)",
  docker_hint:
    "Linux host network · Ergo на 127.0.0.1:9053. Вставь на машине с нодой.",
  need_token_docker: "Создай или вставь токен — появится Docker-команда.",
  install_label: "INSTALL.SH (БЕЗ DOCKER)",
  install_hint: "curl install с GitHub, затем RUN ниже.",
  run_label: "RUN AGENT",
  run_hint: "После install.sh — тот же токен.",
  bridge_footer:
    "Vault через Telegram link. Держи агента рядом с нодой для режима МОЯ НОДА.",
  copy: "КОПИР.",
  copied: "СКОПИР.",
  toast_copied: "Скопировано",
  toast_copy_failed: "Не удалось скопировать",
  toast_bridge_saved: "Bridge сохранён",
  toast_bridge_cleared: "Токен очищен",
  toast_token_created: "Токен создан — скопируй Docker ниже",
  toast_mint_failed: "Не удалось создать токен",

  alerts_sheet_title: "Алерты",
  alerts_intro:
    "Личные сообщения в Telegram, если bridge падает, поднимается или oracle «болеет».",
  watchdog: "Watchdog",
  armed: "Включён",
  off: "Выкл",
  need_start: " · нужен /start",
  send_test: "ТЕСТ",
  on: "ON",
  off_btn: "OFF",
  hint_save_token: "Сначала сохрани bridge-токен (Я → Bridge)",
  hint_bot_off: "Бот не настроен на сервере",
  hint_auth: "Открой Mini App из @ergolumen_bot для проверки",
  hint_load_fail: "Не удалось загрузить алерты",
  hint_start_bot: "Сначала /start в @ergolumen_bot",
  hint_watchdog_on: "Watchdog: bridge offline · oracle · lag",
  hint_opt_in: "Включи алерты о проблемах",
  hint_network: "Ошибка сети",
  hint_enabled_test: "Включено · тестовое сообщение отправлено",
  hint_alerts_on: "Алерты включены",
  hint_muted: "Выключено",
  toast_alerts_on: "Telegram-алерты включены",
  toast_could_enable: "Не удалось включить",
  toast_could_mute: "Не удалось выключить",
  toast_alerts_muted: "Алерты выключены",
  toast_test_sent: "Тест отправлен",
  toast_test_failed: "Тест не удался",
  toast_network: "Ошибка сети",
  close_aria: "Закрыть",
};

const DICT: Record<MiniLocale, Record<MiniMsgKey, string>> = {
  en: EN as unknown as Record<MiniMsgKey, string>,
  ru: RU,
};

export function isMiniLocale(v: unknown): v is MiniLocale {
  return v === "en" || v === "ru";
}

/** Resolve UI locale for Mini App */
export function detectMiniLocale(): MiniLocale {
  if (typeof window === "undefined") return "en";
  try {
    const saved = localStorage.getItem(LS_MINI_LOCALE);
    if (isMiniLocale(saved)) return saved;
  } catch {
    /* */
  }
  try {
    const wa = (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            initDataUnsafe?: { user?: { language_code?: string } };
          };
        };
      }
    ).Telegram?.WebApp;
    const code = (
      wa?.initDataUnsafe?.user?.language_code ||
      navigator.language ||
      ""
    )
      .toLowerCase()
      .slice(0, 2);
    if (code === "ru" || code === "uk" || code === "be" || code === "kk") {
      return "ru";
    }
  } catch {
    /* */
  }
  return "en";
}

export function saveMiniLocale(locale: MiniLocale): void {
  try {
    localStorage.setItem(LS_MINI_LOCALE, locale);
  } catch {
    /* */
  }
}

export function t(
  locale: MiniLocale,
  key: MiniMsgKey,
  vars?: Record<string, string | number | null | undefined>
): string {
  const table = DICT[locale] || DICT.en;
  let s = table[key] ?? DICT.en[key] ?? String(key);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, v == null ? "—" : String(v));
    }
  }
  return s;
}

export function tabShort(locale: MiniLocale, id: string): string {
  switch (id) {
    case "home":
      return t(locale, "tab_home");
    case "network":
      return t(locale, "tab_network");
    case "oracles":
      return t(locale, "tab_oracles");
    case "me":
      return t(locale, "tab_me");
    default:
      return id;
  }
}
