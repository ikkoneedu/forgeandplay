"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function ProfileView() {
  const t = useTranslations("profile");
  const tAuth = useTranslations("auth");
  const { user, loading, configured, signOut } = useAuth();

  const accounts = [
    { name: "Steam", icon: "🎮", connected: false },
    { name: "Epic", icon: "🕹", connected: false },
    { name: "Riot", icon: "🎯", connected: false },
    { name: "Xbox", icon: "Ⓧ", connected: false },
    { name: "PlayStation", icon: "▶", connected: false },
  ];
  const badges = [
    { icon: "🔥", label: "Erken Üye" },
    { icon: "🎯", label: "Yeni Oyuncu" },
  ];

  if (configured && loading) {
    return (
      <div className="wrap">
        <p className="games-empty">…</p>
      </div>
    );
  }

  if (configured && !user) {
    return (
      <div className="wrap">
        <div className="auth-wrap" style={{ textAlign: "center" }}>
          <h1>{t("title")}</h1>
          <p style={{ color: "var(--muted)", marginBottom: 18 }}>{tAuth("loginPrompt")}</p>
          <Link href="/giris" className="btn btn-p" style={{ padding: "13px 24px" }}>
            {tAuth("loginTitle")}
          </Link>
        </div>
      </div>
    );
  }

  const name =
    user?.displayName ||
    (user?.isAnonymous ? tAuth("guestName") : user?.email?.split("@")[0]) ||
    "Oyuncu";

  return (
    <div className="wrap">
      {!configured && <div className="demo-note" style={{ marginTop: 24 }}>✦ {t("demo")}</div>}

      <div className="prof-head">
        <div className="prof-av" aria-hidden="true" style={user?.photoURL ? { background: "none" } : undefined}>
          {user?.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.photoURL} alt="" width={88} height={88} style={{ borderRadius: 22 }} />
          ) : (
            "🎮"
          )}
        </div>
        <div className="prof-meta">
          <h1>{name}</h1>
          <div className="sub">{t("level")} 1 · {t("member")} 2026</div>
        </div>
        {user && (
          <button
            className="btn btn-g"
            style={{ marginLeft: "auto", padding: "12px 20px" }}
            onClick={() => signOut()}
          >
            {tAuth("logout")}
          </button>
        )}
      </div>

      <div className="prof-grid">
        <div>
          <div className="panel">
            <h2>{t("stats")}</h2>
            <div className="statrow">
              <div className="s"><b>0</b><small>{t("matches")}</small></div>
              <div className="s"><b>0</b><small>{t("wins")}</small></div>
              <div className="s"><b>0</b><small>{t("friends")}</small></div>
            </div>
          </div>
          <div className="panel">
            <h2>{t("accounts")}</h2>
            {accounts.map((a) => (
              <div key={a.name} className="acc">
                <span>{a.icon} {a.name}</span>
                <button className="btn btn-g" style={{ padding: "7px 14px", fontSize: 12 }}>{t("connect")}</button>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>{t("history")}</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>{t("noHistory")}</p>
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>{t("wallet")}</h2>
            <div className="wallet-big">🪙 0 <span style={{ fontSize: 14, color: "var(--muted2)" }}>{t("coins")}</span></div>
          </div>
          <div className="panel">
            <h2>{t("badges")}</h2>
            <div className="badges">
              {badges.map((b) => (
                <span key={b.label} className="badge-chip">{b.icon} {b.label}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div style={{ height: 60 }} />
    </div>
  );
}
