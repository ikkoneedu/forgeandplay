"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CATEGORIES, type Game, type GameCategory } from "@/lib/games";
import { getHiddenBuiltins, hideBuiltin } from "@/lib/userGames";
import { useAuth } from "@/components/auth/AuthProvider";
import { isAdmin } from "@/lib/admin";
import GameCard from "./GameCard";

export default function GamesBrowser({ games }: { games: Game[] }) {
  const t = useTranslations("portal");
  const tCom = useTranslations("community");
  const { user } = useAuth();
  const admin = isAdmin(user);

  const [cat, setCat] = useState<GameCategory | "all">("all");
  const [q, setQ] = useState("");
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    getHiddenBuiltins().then(setHidden);
  }, []);

  function removeBuiltin(slug: string) {
    if (!window.confirm(tCom("deleteConfirm"))) return;
    hideBuiltin(slug);
    setHidden((h) => [...h, slug]);
  }

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return games.filter((g) => {
      if (hidden.includes(g.slug)) return false;
      const okCat = cat === "all" || g.category === cat;
      const okQ =
        !query ||
        g.title.toLowerCase().includes(query) ||
        g.tags.some((tag) => tag.toLowerCase().includes(query));
      return okCat && okQ;
    });
  }, [games, cat, q, hidden]);

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
            <GameCard
              key={g.slug}
              game={g}
              admin={admin}
              onDelete={() => removeBuiltin(g.slug)}
            />
          ))}
        </div>
      )}
    </>
  );
}
