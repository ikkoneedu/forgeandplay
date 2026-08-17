"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { listUserGames, type UserGame } from "@/lib/userGames";

export default function CommunityGames({ showHeader = true }: { showHeader?: boolean }) {
  const t = useTranslations("community");
  const [games, setGames] = useState<UserGame[] | null>(null);

  useEffect(() => {
    listUserGames().then(setGames);
  }, []);

  return (
    <section className="sec">
      {showHeader && (
        <div className="sec-h">
          <div>
            <h2 style={{ fontSize: 22 }}>🌟 {t("title")}</h2>
            <p>{t("desc")}</p>
          </div>
          <Link href="/topluluk/yukle" className="btn btn-p" style={{ padding: "10px 18px", fontSize: 14 }}>
            ＋ {t("upload")}
          </Link>
        </div>
      )}

      {games === null ? (
        <p className="games-empty">…</p>
      ) : games.length === 0 ? (
        <div className="games-empty">
          <p>{t("empty")}</p>
          <Link href="/topluluk/yukle" className="btn btn-p" style={{ padding: "12px 22px", marginTop: 8 }}>
            ＋ {t("upload")}
          </Link>
        </div>
      ) : (
        <div className="games-grid">
          {games.map((g) => (
            <Link key={g.id} href={`/topluluk/${g.id}`} className="gcard" style={{ display: "block" }}>
              <div className={`cov ${g.cover}`}>
                <span className="cover-emoji" aria-hidden="true">{g.emoji}</span>
                <h4>{g.title}</h4>
              </div>
              <div className="m">
                <span>{t("by")} {g.author}</span>
                <span className="pl">▶ {t("play")}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
