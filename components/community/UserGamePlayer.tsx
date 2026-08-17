"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getUserGame, incPlays, type UserGame } from "@/lib/userGames";

export default function UserGamePlayer({ id }: { id: string }) {
  const t = useTranslations("community");
  const [game, setGame] = useState<UserGame | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    getUserGame(id).then((g) => {
      if (!active) return;
      setGame(g ?? null);
      if (g) incPlays(id);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (game === undefined) {
    return (
      <div className="wrap">
        <p className="games-empty">…</p>
      </div>
    );
  }

  if (game === null) {
    return (
      <div className="wrap">
        <div className="page-head">
          <h1>404</h1>
          <p>{t("empty")}</p>
        </div>
        <Link href="/topluluk" className="btn btn-g" style={{ padding: "12px 20px" }}>
          ← {t("form.back")}
        </Link>
        <div style={{ height: 60 }} />
      </div>
    );
  }

  return (
    <div className="wrap">
      <nav className="breadcrumb" aria-label="breadcrumb">
        <Link href="/">Forge&amp;Play</Link>
        <span>/</span>
        <Link href="/topluluk">{t("title")}</Link>
        <span>/</span>
        <span>{game.title}</span>
      </nav>

      <header className="page-head" style={{ paddingBottom: 4 }}>
        <h1>
          {game.emoji} {game.title}
        </h1>
        <p>
          {t("by")} {game.author}
        </p>
      </header>

      <div className="player-frame" style={{ maxWidth: 900, margin: "0 auto" }}>
        <iframe
          title={game.title}
          srcDoc={game.html}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </div>

      <p className="demo-note" style={{ marginTop: 18 }}>
        🔒 {t("safety")}
      </p>
      <div style={{ height: 50 }} />
    </div>
  );
}
