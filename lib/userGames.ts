import type { GameCategory } from "@/lib/games";
import { isFirebaseConfigured } from "./firebase";
import { getDb } from "./db";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  query,
  where,
} from "firebase/firestore";

export interface UserGame {
  id: string;
  title: string;
  author: string;
  ownerId: string;
  category: GameCategory;
  emoji: string;
  cover: string;
  minAge: number;
  html: string;
  createdAt: number;
  status: "pending" | "approved";
  plays: number;
}

const KEY = "fp:userGames";
// Firestore document max is 1 MB; keep the HTML comfortably under it.
const MAX_BYTES = 900 * 1024;
const COVERS = ["c1", "c2", "c3", "c4"];

const configured = () => isFirebaseConfigured();

/* ------------------------------------------------------------------ */
/* localStorage fallback (demo, single browser)                        */
/* ------------------------------------------------------------------ */
function readLocal(): UserGame[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function writeLocal(list: UserGame[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

const byNewest = (a: UserGame, b: UserGame) => b.createdAt - a.createdAt;

/* ------------------------------------------------------------------ */
/* Public API (Firestore when configured, else localStorage)           */
/* ------------------------------------------------------------------ */
export async function listUserGames(): Promise<UserGame[]> {
  if (configured()) {
    const snap = await getDocs(
      query(collection(getDb(), "games"), where("status", "==", "approved"))
    );
    return snap.docs.map((d) => d.data() as UserGame).sort(byNewest);
  }
  return readLocal()
    .filter((g) => g.status === "approved")
    .sort(byNewest);
}

export async function getUserGame(id: string): Promise<UserGame | undefined> {
  if (configured()) {
    const s = await getDoc(doc(getDb(), "games", id));
    return s.exists() ? (s.data() as UserGame) : undefined;
  }
  return readLocal().find((g) => g.id === id);
}

export interface NewGameInput {
  title: string;
  author: string;
  ownerId: string;
  category: GameCategory;
  emoji: string;
  minAge: number;
  html: string;
}

export async function addUserGame(input: NewGameInput): Promise<UserGame> {
  const html = input.html;
  if (!html.trim()) throw new Error("empty");
  if (new Blob([html]).size > MAX_BYTES) throw new Error("size");

  const game: UserGame = {
    id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim().slice(0, 80),
    author: (input.author.trim() || "Anonim").slice(0, 40),
    ownerId: input.ownerId || "local",
    category: input.category,
    emoji: input.emoji.trim().slice(0, 4) || "🎮",
    cover: COVERS[Math.floor(Math.random() * COVERS.length)],
    minAge: input.minAge,
    html,
    createdAt: Date.now(),
    status: "approved",
    plays: 0,
  };

  if (configured()) {
    await setDoc(doc(getDb(), "games", game.id), game);
  } else {
    const list = readLocal();
    list.push(game);
    writeLocal(list);
  }
  return game;
}

export async function incPlays(id: string): Promise<void> {
  if (configured()) {
    try {
      await updateDoc(doc(getDb(), "games", id), { plays: increment(1) });
    } catch {
      /* non-admin writes are rejected by rules — best effort only */
    }
    return;
  }
  const list = readLocal();
  const g = list.find((x) => x.id === id);
  if (g) {
    g.plays += 1;
    writeLocal(list);
  }
}

export async function listUserGamesByOwner(ownerId: string): Promise<UserGame[]> {
  if (configured()) {
    const snap = await getDocs(
      query(collection(getDb(), "games"), where("ownerId", "==", ownerId))
    );
    return snap.docs.map((d) => d.data() as UserGame).sort(byNewest);
  }
  return readLocal()
    .filter((g) => g.ownerId === ownerId)
    .sort(byNewest);
}

/** Deletes a game. Server-side security is enforced by Firestore rules. */
export async function deleteUserGame(
  id: string,
  requesterId: string,
  isAdminFlag = false
): Promise<boolean> {
  if (configured()) {
    try {
      await deleteDoc(doc(getDb(), "games", id));
      return true;
    } catch {
      return false;
    }
  }
  const list = readLocal();
  const g = list.find((x) => x.id === id);
  if (!g) return false;
  if (g.ownerId !== requesterId && !isAdminFlag) return false;
  writeLocal(list.filter((x) => x.id !== id));
  return true;
}

/* ------------------------------------------------------------------ */
/* Hidden built-in games (global config doc when Firestore is on)      */
/* ------------------------------------------------------------------ */
const HKEY = "fp:hiddenBuiltins";

export async function getHiddenBuiltins(): Promise<string[]> {
  if (configured()) {
    try {
      const s = await getDoc(doc(getDb(), "config", "games"));
      return s.exists() ? (s.data().hiddenBuiltins as string[]) || [] : [];
    } catch {
      return [];
    }
  }
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HKEY) || "[]");
  } catch {
    return [];
  }
}

export async function hideBuiltin(slug: string): Promise<void> {
  if (configured()) {
    const cur = await getHiddenBuiltins();
    const set = new Set(cur);
    set.add(slug);
    await setDoc(doc(getDb(), "config", "games"), { hiddenBuiltins: [...set] }, { merge: true });
    return;
  }
  const set = new Set(await getHiddenBuiltins());
  set.add(slug);
  localStorage.setItem(HKEY, JSON.stringify([...set]));
}

export async function unhideBuiltin(slug: string): Promise<void> {
  if (configured()) {
    const cur = await getHiddenBuiltins();
    await setDoc(
      doc(getDb(), "config", "games"),
      { hiddenBuiltins: cur.filter((s) => s !== slug) },
      { merge: true }
    );
    return;
  }
  const set = new Set(await getHiddenBuiltins());
  set.delete(slug);
  localStorage.setItem(HKEY, JSON.stringify([...set]));
}
