"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Header() {
  const tNav = useTranslations("nav");
  return (
    <nav className="fp-nav">
      <div className="nav-in">
        <Link href="/" className="logo">
          <span className="mk" aria-hidden="true">🔥</span>
          Forge<b>&amp;</b>Play
        </Link>
        <div className="nmenu">
          <Link href="/oyunlar">{tNav("games")}</Link>
          <Link href="/lfg">{tNav("lfg")}</Link>
          <Link href="/turnuvalar">{tNav("tournaments")}</Link>
          <Link href="/topluluk">{tNav("community")}</Link>
          <Link href="/premium" className="prem">👑 {tNav("premium")}</Link>
        </div>
        <div className="nright">
          <LanguageSwitcher />
          <Link
            href="/giris"
            className="btn btn-p"
            style={{ padding: "9px 16px", fontSize: 13.5 }}
          >
            {tNav("login")}
          </Link>
        </div>
      </div>
    </nav>
  );
}
