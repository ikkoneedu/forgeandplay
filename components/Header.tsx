"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";
import { useAuth } from "./auth/AuthProvider";

export default function Header() {
  const tNav = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const { user, signOut, balance } = useAuth();
  const [open, setOpen] = useState(false);

  const displayName =
    user?.displayName || (user?.isAnonymous ? tAuth("guestName") : user?.email?.split("@")[0]) || "";

  const links = (
    <>
      <Link href="/oyunlar" onClick={() => setOpen(false)}>{tNav("games")}</Link>
      <Link href="/lfg" onClick={() => setOpen(false)}>{tNav("lfg")}</Link>
      <Link href="/turnuvalar" onClick={() => setOpen(false)}>{tNav("tournaments")}</Link>
      <Link href="/siralama" onClick={() => setOpen(false)}>{tNav("leaderboard")}</Link>
      <Link href="/topluluk" onClick={() => setOpen(false)}>{tNav("community")}</Link>
      <Link href="/premium" className="prem" onClick={() => setOpen(false)}>👑 {tNav("premium")}</Link>
    </>
  );

  return (
    <nav className="fp-nav">
      <div className="nav-in">
        <Link href="/" className="logo" onClick={() => setOpen(false)}>
          <span className="mk" aria-hidden="true">🔥</span>
          Forge<b>&amp;</b>Play
        </Link>
        <div className="nmenu">{links}</div>
        <div className="nright">
          <LanguageSwitcher />
          <div className="nav-auth">
            {user ? (
              <>
                <Link href="/profil" className="bal-chip" title="Bakiye">
                  ₺{balance.toLocaleString("tr-TR")}
                </Link>
                <Link href="/profil" className="chip" title={displayName}>
                  {user.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.photoURL} alt="" width={20} height={20} style={{ borderRadius: 6 }} />
                  ) : (
                    <span aria-hidden="true">👤</span>
                  )}
                  <span style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</span>
                </Link>
                <button className="btn btn-g" style={{ padding: "9px 14px", fontSize: 13 }} onClick={() => signOut()}>
                  {tAuth("logout")}
                </button>
              </>
            ) : (
              <Link href="/giris" className="btn btn-p" style={{ padding: "9px 16px", fontSize: 13.5 }}>
                {tNav("login")}
              </Link>
            )}
          </div>
          <button
            className={`burger ${open ? "open" : ""}`}
            aria-label="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <i /><i /><i />
          </button>
        </div>
      </div>

      <div className={`mobile-menu ${open ? "open" : ""}`}>
        {links}
        {user ? (
          <Link href="/profil" onClick={() => setOpen(false)}>👤 {displayName || tNav("login")}</Link>
        ) : (
          <Link href="/giris" onClick={() => setOpen(false)}>{tNav("login")}</Link>
        )}
      </div>
    </nav>
  );
}
