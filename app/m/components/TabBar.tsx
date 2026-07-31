"use client";

import { Activity, Globe2, LineChart, User } from "lucide-react";
import type { MiniTabId } from "../lib/tabs";
import { MINI_TABS } from "../lib/tabs";
import { tabShort } from "../lib/i18n";
import { useMiniI18n } from "../lib/MiniI18n";

const ICONS: Record<MiniTabId, typeof Activity> = {
  home: Activity,
  network: Globe2,
  oracles: LineChart,
  me: User,
};

export default function TabBar({
  active,
  onChange,
}: {
  active: MiniTabId;
  onChange: (id: MiniTabId) => void;
}) {
  const { locale, t } = useMiniI18n();
  return (
    <nav
      className="mini-tabbar shrink-0 border-t border-white/10 bg-[#0A0A0F]/95 backdrop-blur-xl"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      aria-label={t("nav_main")}
    >
      <div className="grid grid-cols-4 h-[52px]">
        {MINI_TABS.map((tab) => {
          const Icon = ICONS[tab.id];
          const on = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] lumen-ui-transition active:scale-[0.97] ${
                on ? "text-[#FF7A3D]" : "text-[#A0A0B0]"
              }`}
              aria-current={on ? "page" : undefined}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={on ? 2.25 : 1.75} />
              <span className="text-[10px] font-mono tracking-wide">
                {tabShort(locale, tab.id)}
              </span>
              <span
                className={`h-0.5 w-5 rounded-full mt-0.5 ${
                  on ? "bg-[#FF7A3D]" : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
