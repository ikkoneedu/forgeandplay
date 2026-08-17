"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { isAdmin } from "@/lib/admin";
import { loginAsGuest } from "@/lib/auth";
import { getAllLfgGames } from "@/lib/lfg";
import { getTournaments } from "@/lib/tournaments";
import {
  tournamentsSupported,
  listenTournaments,
  createTournament,
  joinTournament,
  deleteTournament,
  type Tournament,
} from "@/lib/tournamentsDb";

export default function TournamentsBoard() {
  const t = useTranslations("tournaments");
  const locale = useLocale();
  const { user } = useAuth();
  const admin = isAdmin(user);
  const live = tournamentsSupported();

  const [tours, setTours] = useState<Tournament[]>(() =>
    live
      ? []
      : getTournaments().map((d) => ({
          id: d.slug,
          name: d.name,
          game: d.game,
          emoji: d.emoji,
          cover: d.cover,
          mode: d.mode,
          prize: d.prize,
          date: d.date,
          slots: d.slots,
          participants: Array(d.filled).fill("demo"),
          premium: d.premium,
          ownerId: "demo",
          createdAt: 0,
        }))
  );
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!live) return;
    return listenTournaments(setTours);
  }, [live]);

  async function ensureUid(): Promise<string> {
    if (user) return user.uid;
    const u = await loginAsGuest();
    return u.uid;
  }

  async function join(tr: Tournament) {
    const uid = await ensureUid();
    if (live) {
      await joinTournament(tr.id, uid);
    } else {
      setTours((ts) =>
        ts.map((x) =>
          x.id === tr.id && !x.participants.includes(uid) && x.participants.length < x.slots
            ? { ...x, participants: [...x.participants, uid] }
            : x
        )
      );
    }
  }

  async function submitCreate(form: FormData) {
    const uid = await ensureUid();
    const g = getAllLfgGames().find((x) => x.slug === String(form.get("game")));
    const days = Number(form.get("days")) || 3;
    const data: Omit<Tournament, "id" | "createdAt"> = {
      name: String(form.get("name") || "Turnuva"),
      game: g?.name || "CS2",
      emoji: g?.emoji || "🎮",
      cover: g?.cover || "a-o",
      mode: String(form.get("mode") || "5v5"),
      prize: String(form.get("prize") || "₺1.000"),
      date: new Date(Date.now() + days * 86400000).toISOString(),
      slots: Number(form.get("slots")) || 16,
      participants: [],
      premium: form.get("premium") === "on",
      ownerId: uid,
    };
    setShowCreate(false);
    if (live) await createTournament(data);
    else setTours((ts) => [...ts, { ...data, id: `t-${Date.now()}`, createdAt: Date.now() }]);
  }

  const dateFmt = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      {admin && (
        <div className="sec-h" style={{ marginTop: 8, marginBottom: 10 }}>
          <h2 style={{ fontSize: 20 }}>{t("upcoming")}</h2>
          <button className="btn btn-p" style={{ padding: "10px 18px", fontSize: 14 }} onClick={() => setShowCreate((s) => !s)}>
            ＋ {t("create")}
          </button>
        </div>
      )}

      {admin && showCreate && (
        <form
          className="create-panel"
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate(new FormData(e.currentTarget));
          }}
        >
          <div className="field">
            <label>{t("name")}</label>
            <input name="name" required />
          </div>
          <div className="field">
            <label>{t("gameField")}</label>
            <select name="game">
              {getAllLfgGames().map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t("modeField")}</label>
            <input name="mode" defaultValue="5v5" />
          </div>
          <div className="field">
            <label>{t("prizeField")}</label>
            <input name="prize" defaultValue="₺1.000" />
          </div>
          <div className="field">
            <label>{t("slotsField")}</label>
            <select name="slots" defaultValue="16">
              {[8, 16, 24, 32, 64].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t("dateField")}</label>
            <input name="days" type="number" defaultValue="3" min="1" />
          </div>
          <div className="field check">
            <input type="checkbox" name="premium" id="prem" />
            <label htmlFor="prem">👑 {t("premiumField")}</label>
          </div>
          <div className="create-actions">
            <button type="button" className="btn btn-g" style={{ padding: "10px 18px" }} onClick={() => setShowCreate(false)}>
              {t("cancel")}
            </button>
            <button type="submit" className="btn btn-p" style={{ padding: "10px 18px" }}>
              {t("submit")}
            </button>
          </div>
        </form>
      )}

      {tours.length === 0 ? (
        <p className="games-empty">{t("empty")}</p>
      ) : (
        <div className="tours">
          {tours.map((tr) => {
            const filled = tr.participants.length;
            const full = filled >= tr.slots;
            const joined = !!user && tr.participants.includes(user.uid);
            return (
              <div key={tr.id} className="tour">
                <div className={`thead ${tr.cover}`}>
                  {tr.premium && <span className="tag-prem">👑 {t("premium")}</span>}
                  <span className="temoji" aria-hidden="true">{tr.emoji}</span>
                </div>
                <div className="tbody">
                  <h3>{tr.name}</h3>
                  <div className="tmeta">{tr.game} · {tr.mode}</div>
                  <div className="trow"><span>{t("prize")}</span><span className="prize">{tr.prize}</span></div>
                  <div className="trow"><span>{t("date")}</span><span>{dateFmt.format(new Date(tr.date))}</span></div>
                  <div className="trow">
                    <span>{t("slots", { filled, total: tr.slots })}</span>
                    <span>{tr.premium ? `👑 ${t("premium")}` : t("free")}</span>
                  </div>
                  <button className="btn btn-p" style={{ width: "100%", justifyContent: "center", marginTop: 12, padding: 11 }} disabled={full && !joined} onClick={() => join(tr)}>
                    {joined ? t("joined") : full ? "—" : t("join")}
                  </button>
                  {admin && live && (
                    <button
                      className="btn btn-g"
                      style={{ width: "100%", justifyContent: "center", marginTop: 8, padding: 9, color: "#ff6b81", borderColor: "rgba(255,107,129,.4)", fontSize: 13 }}
                      onClick={() => deleteTournament(tr.id)}
                    >
                      🗑 {t("delete")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ height: 60 }} />
    </>
  );
}
