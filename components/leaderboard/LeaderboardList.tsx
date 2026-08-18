"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getTopPlayers, type LeaderEntry } from "@/lib/leaderboard";

export default function LeaderboardList() {
  const t = useTranslations("leaderboard");
  const [rows, setRows] = useState<LeaderEntry[] | null>(null);

  useEffect(() => {
    getTopPlayers(50).then(setRows);
  }, []);

  if (rows === null) return <p className="games-empty">…</p>;
  if (rows.length === 0) return <p className="games-empty">{t("empty")}</p>;

  return (
    <div className="lb">
      <div className="lb-head">
        <span>{t("rank")}</span>
        <span>{t("player")}</span>
        <span>{t("wins")}</span>
        <span style={{ textAlign: "right" }}>{t("earnings")}</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.uid} className={`lb-row ${i < 3 ? "top" : ""}`}>
          <span className="lb-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
          <span className="lb-name">{r.name}</span>
          <span className="lb-wins">{r.wins || 0}</span>
          <span className="lb-earn">₺{(r.earnings || 0).toLocaleString("tr-TR")}</span>
        </div>
      ))}
    </div>
  );
}
