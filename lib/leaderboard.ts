import { getDb } from "./db";
import { isFirebaseConfigured } from "./firebase";
import { collection, query, orderBy, limit as qlimit, getDocs, doc, getDoc } from "firebase/firestore";

export interface LeaderEntry {
  uid: string;
  name: string;
  wins: number;
  earnings: number;
}

export async function getTopPlayers(max = 50): Promise<LeaderEntry[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const q = query(collection(getDb(), "leaderboard"), orderBy("earnings", "desc"), qlimit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<LeaderEntry, "uid">) }));
  } catch {
    return [];
  }
}

export async function getMyStats(uid: string): Promise<LeaderEntry | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const s = await getDoc(doc(getDb(), "leaderboard", uid));
    return s.exists() ? { uid, ...(s.data() as Omit<LeaderEntry, "uid">) } : null;
  } catch {
    return null;
  }
}
