"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { listUserGamesByOwner, deleteUserGame, type UserGame } from "@/lib/userGames";
import { getMyStats, type LeaderEntry } from "@/lib/leaderboard";
import { isAdmin } from "@/lib/admin";
import AdminUploadButton from "@/components/community/AdminUploadButton";

export default function ProfileView() {
  const t = useTranslations("profile");
  const tAuth = useTranslations("auth");
  const tCom = useTranslations("community");
  const { user, loading, configured, signOut, balance, addBalance } = useAuth();

  const myId = user?.uid ?? "local";
  const [myGames, setMyGames] = useState<UserGame[]>([]);
  const [stats, setStats] = useState<LeaderEntry | null>(null);

  useEffect(() => {
    listUserGamesByOwner(myId).then(setMyGames);
  }, [myId]);

  useEffect(() => {
    if (user) getMyStats(user.uid).then(setStats);
  }, [user]);

  async function removeGame(id: string) {
    if (!window.confirm(tCom("deleteConfirm"))) return;
    await deleteUserGame(id, myId, isAdmin(user));
    setMyGames((g) => g.filter((x) => x.id !== id));
  }

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
              <div className="s"><b>{stats?.wins ?? 0}</b><small>{t("wins")}</small></div>
              <div className="s"><b>₺{(stats?.earnings ?? 0).toLocaleString("tr-TR")}</b><small>{t("earnings")}</small></div>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>🌟 {tCom("myGames")}</h2>
              <AdminUploadButton style={{ padding: "8px 14px", fontSize: 12.5 }} />
            </div>
            {myGames.length === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>{tCom("noMyGames")}</p>
            ) : (
              myGames.map((g) => (
                <div key={g.id} className="acc">
                  <Link href={`/topluluk/${g.id}`} style={{ color: "var(--text)" }}>
                    {g.emoji} {g.title}
                  </Link>
                  <button
                    className="btn btn-g"
                    style={{ padding: "6px 12px", fontSize: 12, color: "#ff6b81", borderColor: "rgba(255,107,129,.4)" }}
                    onClick={() => removeGame(g.id)}
                  >
                    🗑 {tCom("delete")}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <h2>{t("history")}</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: 0 }}>{t("noHistory")}</p>
          </div>
        </div>

        <div>
          <div className="panel">
            <h2>{t("wallet")}</h2>
            <div className="wallet-big">₺{balance.toLocaleString("tr-TR")}</div>
            {configured && user && (
              <button
                className="btn btn-g"
                style={{ marginTop: 14, padding: "10px 16px", fontSize: 13 }}
                onClick={() => addBalance(500)}
              >
                ＋ {t("topUp")}
              </button>
            )}
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
