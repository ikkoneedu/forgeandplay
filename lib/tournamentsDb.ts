import { getDb } from "./db";
import { isFirebaseConfigured } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
  increment,
} from "firebase/firestore";

export interface TParticipant {
  uid: string;
  name: string;
}

export interface Tournament {
  id: string;
  name: string;
  game: string;
  emoji: string;
  cover: string;
  mode: string;
  date: string; // ISO
  slots: number;
  entryFee: number; // ₺ per player
  commissionPct: number; // site commission %
  prizePool: number; // accumulated ₺
  participants: TParticipant[];
  premium: boolean;
  ownerId: string;
  createdAt: number;
  status: "open" | "finished";
  teamSize?: number;
  winners?: TParticipant[];
  payout?: number;
  payoutEach?: number;
}

export function tournamentsSupported(): boolean {
  return isFirebaseConfigured();
}

/** Prize the winner receives after the site commission. */
export function winnerPayout(t: Pick<Tournament, "prizePool" | "commissionPct">): number {
  return Math.round((t.prizePool || 0) * (1 - (t.commissionPct || 0) / 100));
}

export function listenTournaments(cb: (t: Tournament[]) => void): () => void {
  return onSnapshot(
    collection(getDb(), "tournaments"),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Tournament, "id">) }));
      list.sort((a, b) => {
        if (a.status !== b.status) return a.status === "open" ? -1 : 1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });
      cb(list);
    },
    () => cb([])
  );
}

export async function createTournament(
  data: Omit<Tournament, "id" | "createdAt" | "prizePool" | "participants" | "status">
): Promise<string> {
  const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  await setDoc(doc(getDb(), "tournaments", id), {
    ...data,
    prizePool: 0,
    participants: [],
    status: "open",
    createdAt: Date.now(),
  });
  return id;
}

export class JoinError extends Error {}

/**
 * Join a tournament: atomically deducts the entry fee from the player's wallet
 * and adds them to the pool. Throws JoinError('insufficient'|'full'|'joined'|'closed').
 */
export async function joinTournament(id: string, uid: string, name: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const tRef = doc(getDb(), "tournaments", id);
    const uRef = doc(getDb(), "users", uid);
    const tS = await tx.get(tRef);
    const uS = await tx.get(uRef);
    if (!tS.exists()) throw new JoinError("closed");
    const t = tS.data() as Tournament;
    if (t.status !== "open") throw new JoinError("closed");
    const parts = t.participants || [];
    if (parts.some((p) => p.uid === uid)) throw new JoinError("joined");
    if (parts.length >= t.slots) throw new JoinError("full");
    const bal = uS.exists() ? (uS.data().balance as number) || 0 : 0;
    if (bal < t.entryFee) throw new JoinError("insufficient");
    tx.set(uRef, { balance: bal - t.entryFee, name }, { merge: true });
    tx.update(tRef, {
      participants: [...parts, { uid, name }],
      prizePool: (t.prizePool || 0) + t.entryFee,
    });
  });
}

/**
 * Admin: declare the winning team and split the pool (minus commission) equally
 * among its members. Pass one uid for a solo winner, or many for a team.
 */
export async function finishTournament(id: string, winnerUids: string[]): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const tRef = doc(getDb(), "tournaments", id);
    const tS = await tx.get(tRef);
    if (!tS.exists()) return;
    const t = tS.data() as Tournament;
    if (t.status === "finished") return;

    const winners = (t.participants || []).filter((p) => winnerUids.includes(p.uid));
    if (winners.length === 0) return;

    const total = winnerPayout(t);
    const each = Math.floor(total / winners.length);

    // All reads before any writes (Firestore transaction rule).
    const refs = winners.map((w) => doc(getDb(), "users", w.uid));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));

    snaps.forEach((s, i) => {
      const bal = s.exists() ? (s.data().balance as number) || 0 : 0;
      tx.set(refs[i], { balance: bal + each }, { merge: true });
      // public leaderboard stats (name / wins / earnings)
      tx.set(
        doc(getDb(), "leaderboard", winners[i].uid),
        { name: winners[i].name, wins: increment(1), earnings: increment(each) },
        { merge: true }
      );
    });

    tx.update(tRef, {
      status: "finished",
      winners,
      payout: each * winners.length,
      payoutEach: each,
    });
  });
}

export async function deleteTournament(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), "tournaments", id));
}

/* ---- Match result reports (evidence for winner verification) ---- */
export interface MatchReport {
  uid: string;
  name: string;
  claimWin: boolean;
  proof: string;
  createdAt: number;
}

export function listenReports(tid: string, cb: (r: MatchReport[]) => void): () => void {
  return onSnapshot(
    collection(getDb(), "tournaments", tid, "reports"),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as MatchReport);
      list.sort((a, b) => b.createdAt - a.createdAt);
      cb(list);
    },
    () => cb([])
  );
}

export async function submitReport(
  tid: string,
  r: Omit<MatchReport, "createdAt">
): Promise<void> {
  await setDoc(doc(getDb(), "tournaments", tid, "reports", r.uid), {
    ...r,
    createdAt: Date.now(),
  });
}
