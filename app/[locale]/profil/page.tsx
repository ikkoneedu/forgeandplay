import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");

  const accounts = [
    { name: "Steam", icon: "🎮", connected: true, handle: "MrClutch_TR" },
    { name: "Epic", icon: "🕹", connected: false },
    { name: "Riot", icon: "🎯", connected: true, handle: "zephyr#TR1" },
    { name: "Xbox", icon: "Ⓧ", connected: false },
    { name: "PlayStation", icon: "▶", connected: false },
  ];
  const badges = [
    { icon: "🔥", label: "Erken Üye" },
    { icon: "🏅", label: "İlk Zafer" },
    { icon: "🤝", label: "Güvenilir Oyuncu" },
    { icon: "🎯", label: "10 Maç" },
  ];

  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <div className="wrap">
        <div className="demo-note" style={{ marginTop: 24 }}>✦ {t("demo")}</div>

        <div className="prof-head">
          <div className="prof-av" aria-hidden="true">🎮</div>
          <div className="prof-meta">
            <h1>Oyuncu</h1>
            <div className="sub">{t("level")} 7 · {t("member")} 2026</div>
          </div>
          <Link href="/giris" className="btn btn-g" style={{ marginLeft: "auto", padding: "12px 20px" }}>
            {t("title")}
          </Link>
        </div>

        <div className="prof-grid">
          <div>
            <div className="panel">
              <h2>{t("stats")}</h2>
              <div className="statrow">
                <div className="s"><b>128</b><small>{t("matches")}</small></div>
                <div className="s"><b>74</b><small>{t("wins")}</small></div>
                <div className="s"><b>36</b><small>{t("friends")}</small></div>
              </div>
            </div>
            <div className="panel">
              <h2>{t("accounts")}</h2>
              {accounts.map((a) => (
                <div key={a.name} className="acc">
                  <span>{a.icon} {a.name}{a.connected && a.handle ? ` · ${a.handle}` : ""}</span>
                  {a.connected ? (
                    <span style={{ color: "var(--mint)", fontSize: 13, fontWeight: 700 }}>✓</span>
                  ) : (
                    <button className="btn btn-g" style={{ padding: "7px 14px", fontSize: 12 }}>{t("connect")}</button>
                  )}
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
              <div className="wallet-big">🪙 1.250 <span style={{ fontSize: 14, color: "var(--muted2)" }}>{t("coins")}</span></div>
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
    </>
  );
}
