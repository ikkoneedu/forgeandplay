import { getDb } from "./db";
import { isFirebaseConfigured } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  runTransaction,
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
  winnerUid?: string;
  winnerName?: string;
  payout?: number;
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

/** Admin: declare the winner and pay out the pool (minus commission) to them. */
export async function finishTournament(id: string, winnerUid: string): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const tRef = doc(getDb(), "tournaments", id);
    const tS = await tx.get(tRef);
    if (!tS.exists()) return;
    const t = tS.data() as Tournament;
    if (t.status === "finished") return;
    const winner = (t.participants || []).find((p) => p.uid === winnerUid);
    if (!winner) return;
    const uRef = doc(getDb(), "users", winnerUid);
    const uS = await tx.get(uRef);
    const bal = uS.exists() ? (uS.data().balance as number) || 0 : 0;
    const payout = winnerPayout(t);
    tx.set(uRef, { balance: bal + payout }, { merge: true });
    tx.update(tRef, {
      status: "finished",
      winnerUid,
      winnerName: winner.name,
      payout,
    });
  });
}

export async function deleteTournament(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), "tournaments", id));
}
