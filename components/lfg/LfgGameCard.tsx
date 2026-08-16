"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { LfgGame } from "@/lib/lfg";

export default function LfgGameCard({ game }: { game: LfgGame }) {
  const t = useTranslations("lfg");
  return (
    <Link href={`/lfg/${game.slug}`} className="gcard" style={{ display: "block" }}>
      <div className={`cov ${game.cover}`}>
        <span className="cover-emoji" aria-hidden="true">
          {game.emoji}
        </span>
        <h4>{game.name}</h4>
      </div>
      <div className="m">
        <span>{game.platforms.slice(0, 2).join(" · ")}</span>
        <span className="pl">● {t("index.players", { count: game.players.toLocaleString() })}</span>
      </div>
    </Link>
  );
}
