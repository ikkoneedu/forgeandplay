"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export default function GamePlayer({
  slug,
  entry,
  title,
}: {
  slug: string;
  entry: string;
  title: string;
}) {
  const t = useTranslations("portal");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const bestKey = useRef(`fp:best:${slug}`);

  useEffect(() => {
    setBest(Number(localStorage.getItem(bestKey.current) || "0"));

    const onMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.type !== "forgeplay:score" || data.game !== slug) return;
      const s = Number(data.score) || 0;
      setScore(s);
      setBest((prev) => {
        if (s > prev) {
          localStorage.setItem(bestKey.current, String(s));
          return s;
        }
        return prev;
      });
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [slug]);

  return (
    <div className="game-stage">
      <div className="player-frame">
        <iframe
          src={entry}
          title={title}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
        />
      </div>

      <div className="game-side">
        <div className="score-panel">
          <div className="score-box">
            <small>{t("play.score")}</small>
            <b>{score.toLocaleString()}</b>
          </div>
          <div className="score-box">
            <small>{t("play.best")}</small>
            <b>{best.toLocaleString()}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
