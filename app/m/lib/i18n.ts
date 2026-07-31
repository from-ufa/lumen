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
  home_seg_dash: "Overview",
  home_seg_blocks: "Blocks",
  home_seg_mempool: "Mempool",
  home_blocks_link: "Blocks · {n}",
  home_last_block: "Last block",
  home_tap_blocks: "tap for list",
  home_tile_blocks_sub: "recent chain",
  home_tile_mempool_sub: "pending txs",
  home_tile_ora_sub: "ERG/USD",
  blk_title: "Blocks",
  blk_tip: "Chain tip",
  blk_shown: "Listed",
  blk_search: "Height or id…",
  blk_count: "{n} / {total} blocks",
  blk_empty: "No blocks yet",
  blk_empty_body: "Waiting for tip height / node.",
  blk_empty_search: "No matching blocks",
  blk_empty_search_body: "Clear search or pull to refresh.",
  mp_title: "Mempool",
  mp_pending: "Pending txs",
  mp_volume: "Σ ERG out",
  mp_search: "Search tx id…",
  mp_showing: "{n} / {total} txs",
  mp_empty: "Mempool empty",
  mp_empty_body: "No unconfirmed transactions right now.",
  mp_empty_search: "No matching txs",
  mp_empty_search_body: "Clear search or wait for new txs.",
  mp_tokens: "tokens",
  ora_view_pools: "Pools",
  ora_view_ops: "Operators",
  ops_title: "OPERATORS",
  ops_idle_keys: "Idle keys: {n}",
  ops_all_pools: "All pools",
  ops_filter_off: "OFF",
  ops_search: "Address, pair…",
  ops_count: "{n} / {total} operators",
  ops_empty: "No operators",
  ops_empty_body: "No oracle operator boxes in this filter.",
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
  ora_badge_you: "YOU",
  ora_badge_lumen: "LUMEN",
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
  me_connection: "Connection",
  me_status_guest: "Not connected",
  me_status_guest_body:
    "You browse public LUMEN data. Node, map & oracles are the host — not yours. Connect Bridge to use your machine.",
  me_status_connected: "Connected",
  me_status_connected_body:
    "Bridge agent is online. You can switch data source to My Node and Ora → MY.",
  me_status_token_offline: "Token saved · agent offline",
  me_status_token_offline_body:
    "Token is here, but the agent is not connected. Run Docker/agent next to your Ergo node — or Disconnect.",
  me_token: "Token",
  me_agent: "Agent",
  me_agent_online: "ONLINE",
  me_agent_offline: "OFFLINE",
  me_now_showing: "APP SHOWS NOW",
  me_now_node: "Node / Net",
  me_now_ora: "Oracles tab",
  me_viewing_personal: "YOUR node",
  me_viewing_lumen: "LUMEN (public)",
  me_ora_my: "MY (your agent)",
  me_ora_lumen: "NETWORK (LUMEN)",
  me_now_hint:
    "Ora → NETWORK is always LUMEN pools. YOU labels only on Ora → MY with a live agent.",
  me_data_source: "DATA SOURCE",
  me_src_lumen_sub: "Public host node & map",
  me_src_my_sub: "Your machine via Bridge",
  me_src_my_need_token: "Needs Bridge token first",
  me_connect_cta: "CONNECT BRIDGE",
  me_edit_bridge: "EDIT TOKEN",
  me_disconnect: "DISCONNECT",
  me_disconnected_toast: "Disconnected · showing LUMEN",
  me_alerts_need_token: "Connect Bridge first for private alerts",
  me_link_title: "LINK FROM SITE",
  me_link_body:
    "On ergolumen.net → Settings → LINK TELEGRAM → generate code. Paste it here.",
  me_link_placeholder: "CODE",
  me_link_apply: "LINK",
  me_link_ok: "Linked · Bridge restored",
  me_link_bad: "Code invalid or expired",
  me_link_auth: "Open Mini App from the bot first",
  me_link_fail: "Link failed",
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
  alerts_intro_rich:
    "Private Telegram pings for your node & oracle via Bridge. Edge-only (problem → ok) — no spam every poll.",
  al_scopes: "WATCH",
  al_scope_node: "Node",
  al_scope_node_sub: "Offline, peers, sync lag, stuck height",
  al_scope_oracle: "Oracle",
  al_scope_oracle_sub: "DOWN, lag, missed refresh, low gas",
  al_min_peers: "Min peers",
  al_min_peers_hint: "Alert if P2P sessions drop below",
  al_post_lag: "Oracle lag (blocks)",
  al_post_lag_hint: "Alert if last publish older than this",
  al_save_prefs: "SAVE PREFS",
  al_catalog: "WHAT WE WATCH",
  al_cat_node:
    "Node: bridge · unreachable · peers low · sync lag · height stuck 30m",
  al_cat_oracle:
    "Oracle: agent DOWN · publish lag · missed pool refresh · low ERG gas",
  al_cat_edge: "Alerts fire on transitions; recovery messages when fixed.",
  al_live_state: "LIVE STATE",
  al_st_bridge: "Bridge",
  al_st_node: "Node reachability",
  al_st_peers: "Peers",
  al_st_sync: "Sync lag",
  al_st_height: "Height stuck",
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

  home_seg_dash: "Обзор",
  home_seg_blocks: "Блоки",
  home_seg_mempool: "Mempool",
  home_blocks_link: "Блоки · {n}",
  home_last_block: "Последний блок",
  home_tap_blocks: "список →",
  home_tile_blocks_sub: "недавние",
  home_tile_mempool_sub: "pending",
  home_tile_ora_sub: "ERG/USD",
  blk_title: "Блоки",
  blk_tip: "Tip цепи",
  blk_shown: "В списке",
  blk_search: "Высота или id…",
  blk_count: "{n} / {total} блоков",
  blk_empty: "Пока нет блоков",
  blk_empty_body: "Ждём tip / ноду.",
  blk_empty_search: "Ничего не найдено",
  blk_empty_search_body: "Очисти поиск или обнови.",
  mp_title: "Mempool",
  mp_pending: "Ожидают входа",
  mp_volume: "Σ ERG out",
  mp_search: "Поиск tx id…",
  mp_showing: "{n} / {total} txs",
  mp_empty: "Mempool пуст",
  mp_empty_body: "Нет unconfirmed транзакций.",
  mp_empty_search: "Ничего не найдено",
  mp_empty_search_body: "Очисти поиск или подожди новые tx.",
  mp_tokens: "токенов",
  ora_view_pools: "Пулы",
  ora_view_ops: "Операторы",
  ops_title: "ОПЕРАТОРЫ",
  ops_idle_keys: "Idle keys: {n}",
  ops_all_pools: "Все пулы",
  ops_filter_off: "OFF",
  ops_search: "Адрес, pair…",
  ops_count: "{n} / {total} операторов",
  ops_empty: "Нет операторов",
  ops_empty_body: "Нет oracle-операторов в этом фильтре.",
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
  ora_badge_you: "YOU",
  ora_badge_lumen: "LUMEN",
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
  me_connection: "Подключение",
  me_status_guest: "Не подключено",
  me_status_guest_body:
    "Смотришь публичные данные LUMEN. Нода, карта и оракулы — host, не твои. Подключи Bridge, чтобы работать со своей машиной.",
  me_status_connected: "Подключено",
  me_status_connected_body:
    "Bridge-агент online. Можно источник My Node и Ora → MY.",
  me_status_token_offline: "Токен есть · агент offline",
  me_status_token_offline_body:
    "Токен сохранён, но агент не подключён. Запусти Docker/agent у Ergo-ноды — или Отключись.",
  me_token: "Токен",
  me_agent: "Агент",
  me_agent_online: "ONLINE",
  me_agent_offline: "OFFLINE",
  me_now_showing: "СЕЙЧАС В ПРИЛОЖЕНИИ",
  me_now_node: "Нода / Net",
  me_now_ora: "Вкладка Ora",
  me_viewing_personal: "ТВОЯ нода",
  me_viewing_lumen: "LUMEN (публично)",
  me_ora_my: "MY (твой агент)",
  me_ora_lumen: "NETWORK (LUMEN)",
  me_now_hint:
    "Ora → NETWORK всегда пулы LUMEN. YOU только на Ora → MY при живом агенте.",
  me_data_source: "ИСТОЧНИК ДАННЫХ",
  me_src_lumen_sub: "Публичная нода и карта host",
  me_src_my_sub: "Твоя машина через Bridge",
  me_src_my_need_token: "Сначала нужен Bridge-токен",
  me_connect_cta: "ПОДКЛЮЧИТЬ BRIDGE",
  me_edit_bridge: "ТОКЕН",
  me_disconnect: "ОТКЛЮЧИТЬ",
  me_disconnected_toast: "Отключено · показываем LUMEN",
  me_alerts_need_token: "Сначала Bridge — потом алерты",
  me_link_title: "LINK С САЙТА",
  me_link_body:
    "На ergolumen.net → Settings → LINK TELEGRAM → код. Вставь сюда.",
  me_link_placeholder: "КОД",
  me_link_apply: "LINK",
  me_link_ok: "Связано · Bridge восстановлен",
  me_link_bad: "Код неверный или истёк",
  me_link_auth: "Сначала открой Mini App из бота",
  me_link_fail: "Не удалось связать",
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
  alerts_intro_rich:
    "Личные пинги в Telegram по твоей ноде и oracle через Bridge. Только переходы (проблема → ок) — без спама.",
  al_scopes: "СЛЕДИМ",
  al_scope_node: "Нода",
  al_scope_node_sub: "Offline, пиры, lag, застрявшая высота",
  al_scope_oracle: "Oracle",
  al_scope_oracle_sub: "DOWN, lag, missed refresh, low gas",
  al_min_peers: "Мин. пиров",
  al_min_peers_hint: "Алерт, если P2P меньше порога",
  al_post_lag: "Lag oracle (блоки)",
  al_post_lag_hint: "Алерт, если пост старше порога",
  al_save_prefs: "СОХРАНИТЬ",
  al_catalog: "ЧТО МОНИТОРИМ",
  al_cat_node:
    "Нода: bridge · unreachable · мало пиров · sync lag · height stuck 30м",
  al_cat_oracle:
    "Oracle: agent DOWN · lag поста · missed refresh · low gas ERG",
  al_cat_edge: "Алерты на переходах; recovery, когда всё ок.",
  al_live_state: "ЖИВОЕ СОСТОЯНИЕ",
  al_st_bridge: "Bridge",
  al_st_node: "Доступность ноды",
  al_st_peers: "Пиры",
  al_st_sync: "Sync lag",
  al_st_height: "Height stuck",
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
