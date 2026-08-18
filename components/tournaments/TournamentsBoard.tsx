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
  submitReport,
  listenReports,
  JoinError,
  type Tournament,
  type MatchReport,
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
      teamSize: Number(form.get("teamSize")) || 1,
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
          <div className="field"><label>{t("teamSizeField")}</label>
            <select name="teamSize" defaultValue="1">{[1, 2, 3, 5].map((n) => <option key={n}>{n}</option>)}</select>
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
                    <div className="winner-row">
                      🏆 {t("winnersLabel")}: <b>{(tr.winners || []).map((w) => w.name).join(", ")}</b>
                      {(tr.winners?.length || 0) > 1 ? ` · ${t("eachGets")} ${money(tr.payoutEach || 0)}` : ` · ${money(tr.payout || 0)}`}
                    </div>
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

                  {joined && !finished && live && user && (
                    <ReportResult tid={tr.id} uid={user.uid} name={user.displayName || "Oyuncu"} t={t} />
                  )}

                  {admin && live && !finished && filled > 0 && (
                    <DeclareWinner tr={tr} t={t} />
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

function ReportResult({
  tid,
  uid,
  name,
  t,
}: {
  tid: string;
  uid: string;
  name: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const [open, setOpen] = useState(false);
  const [won, setWon] = useState<boolean | null>(null);
  const [proof, setProof] = useState("");
  const [done, setDone] = useState(false);

  async function submit() {
    if (won === null) return;
    await submitReport(tid, { uid, name, claimWin: won, proof: proof.trim() });
    setDone(true);
    setOpen(false);
  }

  if (done) {
    return (
      <div style={{ marginTop: 8, fontSize: 13, color: "var(--mint)", textAlign: "center" }}>
        {t("reported")}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="btn btn-g"
        style={{ width: "100%", justifyContent: "center", marginTop: 8, padding: 9, fontSize: 13 }}
        onClick={() => setOpen(true)}
      >
        🚩 {t("reportResult")}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <button
          type="button"
          className={`btn ${won === true ? "btn-p" : "btn-g"}`}
          style={{ flex: 1, justifyContent: "center", padding: 9, fontSize: 13 }}
          onClick={() => setWon(true)}
        >
          {t("reportWon")}
        </button>
        <button
          type="button"
          className={`btn ${won === false ? "btn-p" : "btn-g"}`}
          style={{ flex: 1, justifyContent: "center", padding: 9, fontSize: 13 }}
          onClick={() => setWon(false)}
        >
          {t("reportLost")}
        </button>
      </div>
      <input
        className="search-inp"
        style={{ width: "100%", margin: "0 0 8px", minWidth: 0 }}
        placeholder={t("proofLabel")}
        value={proof}
        onChange={(e) => setProof(e.target.value)}
      />
      <button
        className="btn btn-p"
        style={{ width: "100%", justifyContent: "center", padding: 9, fontSize: 13 }}
        disabled={won === null}
        onClick={submit}
      >
        {t("reportSubmit")}
      </button>
    </div>
  );
}

function DeclareWinner({ tr, t }: { tr: Tournament; t: ReturnType<typeof useTranslations> }) {
  const [sel, setSel] = useState<string[]>([]);
  const [reports, setReports] = useState<MatchReport[]>([]);
  const toggle = (uid: string) =>
    setSel((s) => (s.includes(uid) ? s.filter((x) => x !== uid) : [...s, uid]));

  useEffect(() => listenReports(tr.id, setReports), [tr.id]);

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      {reports.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{t("reportsTitle")}</div>
          {reports.map((r) => (
            <div key={r.uid} style={{ fontSize: 12.5, marginBottom: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ color: r.claimWin ? "var(--mint)" : "var(--muted2)" }}>
                {r.claimWin ? "🏆" : "▫️"} <b>{r.name}</b> · {r.claimWin ? t("claimWin") : t("claimLoss")}
              </span>
              {r.proof && (
                <a href={r.proof} target="_blank" rel="noreferrer" style={{ color: "var(--violet2)" }}>
                  {t("proofLink")} ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{t("selectWinners")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {tr.participants.map((p) => {
          const on = sel.includes(p.uid);
          return (
            <label
              key={p.uid}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 10px",
                borderRadius: 999,
                cursor: "pointer",
                border: "1px solid " + (on ? "var(--mint)" : "var(--line)"),
                background: on ? "rgba(45,226,166,.16)" : "rgba(255,255,255,.04)",
                color: on ? "var(--mint)" : "var(--muted)",
              }}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(p.uid)} />
              {p.name}
            </label>
          );
        })}
      </div>
      <button
        className="btn btn-p"
        style={{ width: "100%", justifyContent: "center", padding: 9, fontSize: 13 }}
        disabled={sel.length === 0}
        onClick={() => sel.length && finishTournament(tr.id, sel)}
      >
        🏆 {t("declareBtn")}
      </button>
    </div>
  );
}
