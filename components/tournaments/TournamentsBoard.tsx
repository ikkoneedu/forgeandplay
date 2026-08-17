"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
  finishTournament,
  deleteTournament,
  winnerPayout,
  JoinError,
  type Tournament,
} from "@/lib/tournamentsDb";

const money = (n: number) => "₺" + (n || 0).toLocaleString("tr-TR");

export default function TournamentsBoard() {
  const t = useTranslations("tournaments");
  const locale = useLocale();
  const { user, balance } = useAuth();
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
          date: d.date,
          slots: d.slots,
          entryFee: 200,
          commissionPct: 10,
          prizePool: 200 * d.filled,
          participants: Array.from({ length: d.filled }, (_, i) => ({ uid: `demo-${i}`, name: "Oyuncu" })),
          premium: d.premium,
          ownerId: "demo",
          createdAt: 0,
          status: "open" as const,
        }))
  );
  const [showCreate, setShowCreate] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    return listenTournaments(setTours);
  }, [live]);

  async function ensure(): Promise<{ uid: string; name: string }> {
    if (user) return { uid: user.uid, name: user.displayName || "Oyuncu" };
    const u = await loginAsGuest();
    return { uid: u.uid, name: u.displayName || "Oyuncu" };
  }

  async function join(tr: Tournament) {
    setErr(null);
    const me = await ensure();
    if (!live) {
      setTours((ts) =>
        ts.map((x) =>
          x.id === tr.id && !x.participants.some((p) => p.uid === me.uid) && x.participants.length < x.slots
            ? { ...x, participants: [...x.participants, me], prizePool: x.prizePool + x.entryFee }
            : x
        )
      );
      return;
    }
    try {
      await joinTournament(tr.id, me.uid, me.name);
    } catch (e) {
      if (e instanceof JoinError && e.message === "insufficient") setErr(tr.id);
    }
  }

  async function submitCreate(form: FormData) {
    const me = await ensure();
    const g = getAllLfgGames().find((x) => x.slug === String(form.get("game")));
    const days = Number(form.get("days")) || 3;
    await createTournament({
      name: String(form.get("name") || "Turnuva"),
      game: g?.name || "CS2",
      emoji: g?.emoji || "🎮",
      cover: g?.cover || "a-o",
      mode: String(form.get("mode") || "5v5"),
      date: new Date(Date.now() + days * 86400000).toISOString(),
      slots: Number(form.get("slots")) || 10,
      entryFee: Number(form.get("entryFee")) || 0,
      commissionPct: Number(form.get("commission")) || 10,
      premium: form.get("premium") === "on",
      ownerId: me.uid,
    });
    setShowCreate(false);
  }

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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
        <form className="create-panel" onSubmit={(e) => { e.preventDefault(); submitCreate(new FormData(e.currentTarget)); }}>
          <div className="field"><label>{t("name")}</label><input name="name" required /></div>
          <div className="field"><label>{t("gameField")}</label>
            <select name="game">{getAllLfgGames().map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}</select>
          </div>
          <div className="field"><label>{t("modeField")}</label><input name="mode" defaultValue="5v5" /></div>
          <div className="field"><label>{t("slotsField")}</label>
            <select name="slots" defaultValue="10">{[2, 4, 6, 10, 16, 32].map((n) => <option key={n}>{n}</option>)}</select>
          </div>
          <div className="field"><label>{t("entryFeeField")}</label><input name="entryFee" type="number" defaultValue="200" min="0" /></div>
          <div className="field"><label>{t("commissionField")}</label><input name="commission" type="number" defaultValue="10" min="0" max="50" /></div>
          <div className="field"><label>{t("dateField")}</label><input name="days" type="number" defaultValue="3" min="1" /></div>
          <div className="field check"><input type="checkbox" name="premium" id="prem" /><label htmlFor="prem">👑 {t("premiumField")}</label></div>
          <div className="create-actions">
            <button type="button" className="btn btn-g" style={{ padding: "10px 18px" }} onClick={() => setShowCreate(false)}>{t("cancel")}</button>
            <button type="submit" className="btn btn-p" style={{ padding: "10px 18px" }}>{t("submit")}</button>
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
            const joined = !!user && tr.participants.some((p) => p.uid === user.uid);
            const finished = tr.status === "finished";
            const payout = winnerPayout(tr);
            return (
              <div key={tr.id} className="tour">
                <div className={`thead ${tr.cover}`}>
                  {finished ? (
                    <span className="tag-prem" style={{ background: "#2de2a6", color: "#05060d" }}>{t("finishedBadge")}</span>
                  ) : tr.premium ? (
                    <span className="tag-prem">👑 {t("premium")}</span>
                  ) : null}
                  <span className="temoji" aria-hidden="true">{tr.emoji}</span>
                </div>
                <div className="tbody">
                  <h3>{tr.name}</h3>
                  <div className="tmeta">{tr.game} · {tr.mode}</div>

                  <div className="pool-box">
                    <small>{t("pool")}</small>
                    <b>{money(tr.prizePool)}</b>
                  </div>

                  <div className="trow"><span>{t("entryFee")}</span><span>{tr.entryFee > 0 ? money(tr.entryFee) : t("freeEntry")}</span></div>
                  <div className="trow"><span>{t("winnerGets")}</span><span className="prize">{money(payout)}</span></div>
                  <div className="trow"><span>{t("commissionLabel")}</span><span>%{tr.commissionPct}</span></div>
                  <div className="trow"><span>{t("date")}</span><span>{dateFmt.format(new Date(tr.date))}</span></div>
                  <div className="trow"><span>{t("slots", { filled, total: tr.slots })}</span></div>

                  {finished ? (
                    <div className="winner-row">🏆 {t("winnerLabel")}: <b>{tr.winnerName}</b> · {money(tr.payout || 0)}</div>
                  ) : (
                    <button
                      className="btn btn-p"
                      style={{ width: "100%", justifyContent: "center", marginTop: 12, padding: 11 }}
                      disabled={(full && !joined) || joined}
                      onClick={() => join(tr)}
                    >
                      {joined ? t("joined") : full ? "—" : tr.entryFee > 0 ? `${money(tr.entryFee)} · ${t("payJoin")}` : t("join")}
                    </button>
                  )}

                  {err === tr.id && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#ff6b81", textAlign: "center" }}>
                      {t("insufficient")} · <Link href="/profil" style={{ color: "var(--violet2)" }}>{t("addBalance")} →</Link>
                    </div>
                  )}

                  {admin && live && !finished && filled > 0 && (
                    <DeclareWinner tr={tr} label={t("declareWinner")} />
                  )}
                  {admin && live && (
                    <button
                      className="btn btn-g"
                      style={{ width: "100%", justifyContent: "center", marginTop: 8, padding: 8, color: "#ff6b81", borderColor: "rgba(255,107,129,.4)", fontSize: 12.5 }}
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

function DeclareWinner({ tr, label }: { tr: Tournament; label: string }) {
  const [sel, setSel] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
      <select className="sel" style={{ flex: 1 }} value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">{label}</option>
        {tr.participants.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
      </select>
      <button
        className="btn btn-p"
        style={{ padding: "0 14px", fontSize: 12.5 }}
        disabled={!sel}
        onClick={() => sel && finishTournament(tr.id, sel)}
      >
        🏆
      </button>
    </div>
  );
}
