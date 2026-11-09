"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "首页", icon: "⌂" },
  { href: "/swap", label: "Swap", icon: "⇄" },
  { href: "/promo", label: "推广", icon: "◎" },
  { href: "/mine", label: "我的", icon: "☺" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tab-bar" aria-label="主导航">
      {tabs.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={active ? "tab active" : "tab"}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span className="tab-label">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
