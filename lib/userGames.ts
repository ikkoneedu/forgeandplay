import type { GameCategory } from "@/lib/games";

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
const MAX_BYTES = 2 * 1024 * 1024;
const COVERS = ["c1", "c2", "c3", "c4"];

/**
 * Demo storage backed by localStorage. When Firebase is configured this module
 * swaps to Firestore (games) + Storage (html) with server-side moderation.
 * Functions are async so that swap requires no call-site changes.
 */

function read(): UserGame[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function write(list: UserGame[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export async function listUserGames(): Promise<UserGame[]> {
  return read()
    .filter((g) => g.status === "approved")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getUserGame(id: string): Promise<UserGame | undefined> {
  return read().find((g) => g.id === id);
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
    // Demo: auto-approved. With Firebase this starts "pending" for moderation.
    status: "approved",
    plays: 0,
  };
  const list = read();
  list.push(game);
  write(list);
  return game;
}

export async function incPlays(id: string): Promise<void> {
  const list = read();
  const g = list.find((x) => x.id === id);
  if (g) {
    g.plays += 1;
    write(list);
  }
}

export async function listUserGamesByOwner(ownerId: string): Promise<UserGame[]> {
  return read()
    .filter((g) => g.ownerId === ownerId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Deletes a game only if the requester owns it. Returns true if deleted. */
export async function deleteUserGame(id: string, requesterId: string): Promise<boolean> {
  const list = read();
  const g = list.find((x) => x.id === id);
  if (!g || g.ownerId !== requesterId) return false;
  write(list.filter((x) => x.id !== id));
  return true;
}

