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

export interface Tournament {
  id: string;
  name: string;
  game: string;
  emoji: string;
  cover: string;
  mode: string;
  prize: string;
  date: string; // ISO
  slots: number;
  participants: string[];
  premium: boolean;
  ownerId: string;
  createdAt: number;
}

export function tournamentsSupported(): boolean {
  return isFirebaseConfigured();
}

export function listenTournaments(cb: (t: Tournament[]) => void): () => void {
  return onSnapshot(
    collection(getDb(), "tournaments"),
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Tournament, "id">) }));
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      cb(list);
    },
    () => cb([])
  );
}

export async function createTournament(data: Omit<Tournament, "id" | "createdAt">): Promise<string> {
  const id = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  await setDoc(doc(getDb(), "tournaments", id), { ...data, createdAt: Date.now() });
  return id;
}

export async function joinTournament(id: string, uid: string): Promise<void> {
  const ref = doc(getDb(), "tournaments", id);
  await runTransaction(getDb(), async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) return;
    const t = s.data() as Tournament;
    if (t.participants.includes(uid)) return;
    if (t.participants.length >= t.slots) return;
    tx.update(ref, { participants: [...t.participants, uid] });
  });
}

export async function leaveTournament(id: string, uid: string): Promise<void> {
  const ref = doc(getDb(), "tournaments", id);
  await runTransaction(getDb(), async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) return;
    const t = s.data() as Tournament;
    tx.update(ref, { participants: t.participants.filter((p) => p !== uid) });
  });
}

export async function deleteTournament(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), "tournaments", id));
}
