"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";

export function TabBar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const tabs = [
    { href: "/", label: t("nav.home"), icon: "⌂", weight: false },
    { href: "/swap", label: t("nav.swap"), icon: "⇄", weight: false },
    { href: "/promo", label: t("nav.weight"), icon: "◎", weight: true },
    { href: "/mine", label: t("nav.mine"), icon: "☺", weight: false },
  ];
  return (
    <nav className="tab-bar" aria-label={t("nav.aria")}>
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        const cls = [active ? "tab active" : "tab", tab.weight ? "tab-weight" : ""].filter(Boolean).join(" ");
        return (
          <Link key={tab.href} href={tab.href} className={cls}>
            <span className="tab-icon" aria-hidden>
              {tab.icon}
            </span>
            <span className="tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
