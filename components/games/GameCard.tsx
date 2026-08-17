"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPlays, type Game } from "@/lib/games";

export default function GameCard({
  game,
  admin,
  onDelete,
}: {
  game: Game;
  admin?: boolean;
  onDelete?: () => void;
}) {
  const t = useTranslations("portal");

  return (
    <div className="gcard-wrap">
      <Link href={`/oyna/${game.slug}`} className="gcard" style={{ display: "block" }}>
        <div className={`cov ${game.cover}`}>
          {game.trend === 1 && <span className="tag t-orange">#1 TREND</span>}
          {game.premium && <span className="lock">🔒 {t("play.premium")}</span>}
          <span className="cover-emoji" aria-hidden="true">
            {game.emoji}
          </span>
          <h4>{game.title}</h4>
        </div>
        <div className="m">
          <span>{t(`cat.${game.category}`)}</span>
          <span className="pl">▶ {formatPlays(game.plays)}</span>
        </div>
      </Link>
      {admin && onDelete && (
        <button
          className="card-del"
          aria-label="delete"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
        >
          🗑
        </button>
      )}
    </div>
  );
}
