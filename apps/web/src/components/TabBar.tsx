"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "首页", icon: "⌂", weight: false },
  { href: "/swap", label: "Swap", icon: "⇄", weight: false },
  // Route stays /promo; locked product IA labels this tab 权重.
  { href: "/promo", label: "权重", icon: "◎", weight: true },
  { href: "/mine", label: "我的", icon: "☺", weight: false },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tab-bar" aria-label="主导航">
      {tabs.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        const cls = [active ? "tab active" : "tab", t.weight ? "tab-weight" : ""].filter(Boolean).join(" ");
        return (
          <Link key={t.href} href={t.href} className={cls}>
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
