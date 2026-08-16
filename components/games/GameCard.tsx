"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPlays, type Game } from "@/lib/games";
import type { Locale } from "@/i18n/routing";

export default function GameCard({ game }: { game: Game }) {
  const t = useTranslations("portal");
  const locale = useLocale() as Locale;

  return (
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
  );
}
