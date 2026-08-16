"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CATEGORIES, type Game, type GameCategory } from "@/lib/games";
import GameCard from "./GameCard";

export default function GamesBrowser({ games }: { games: Game[] }) {
  const t = useTranslations("portal");
  const [cat, setCat] = useState<GameCategory | "all">("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return games.filter((g) => {
      const okCat = cat === "all" || g.category === cat;
      const okQ =
        !query ||
        g.title.toLowerCase().includes(query) ||
        g.tags.some((tag) => tag.toLowerCase().includes(query));
      return okCat && okQ;
    });
  }, [games, cat, q]);

  return (
    <>
      <div className="games-toolbar">
        <button
          className={`cat-btn ${cat === "all" ? "active" : ""}`}
          onClick={() => setCat("all")}
        >
          {t("cat.all")}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`cat-btn ${cat === c ? "active" : ""}`}
            onClick={() => setCat(c)}
          >
            {t(`cat.${c}`)}
          </button>
        ))}
        <input
          className="search-inp"
          placeholder={t("games.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t("games.search")}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="games-empty">{t("games.empty")}</p>
      ) : (
        <div className="games-grid">
          {filtered.map((g) => (
            <GameCard key={g.slug} game={g} />
          ))}
        </div>
      )}
    </>
  );
}
