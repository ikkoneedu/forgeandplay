"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

const ITEMS = [
  { href: "/", icon: "🏠", key: "home" },
  { href: "/oyunlar", icon: "🎮", key: "games" },
  { href: "/lfg", icon: "👥", key: "lfg" },
  { href: "/turnuvalar", icon: "🏆", key: "tournaments" },
  { href: "/profil", icon: "👤", key: "__profile" },
] as const;

export default function BottomNav() {
  const tNav = useTranslations("nav");
  const tProfile = useTranslations("profile");
  const path = usePathname();
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav className="bottom-nav" aria-label="mobile navigation">
      {ITEMS.map((it) => (
        <Link key={it.href} href={it.href} className={isOn(it.href) ? "on" : ""}>
          <span className="bn-ic" aria-hidden="true">{it.icon}</span>
          {it.key === "__profile" ? tProfile("title") : tNav(it.key)}
        </Link>
      ))}
    </nav>
  );
}
