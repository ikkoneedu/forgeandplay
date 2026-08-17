import { isFirebaseConfigured } from "./firebase";
import { getDb } from "./db";
import { collection, getCountFromServer } from "firebase/firestore";

export async function getLiveCounts(): Promise<{ rooms: number; communityGames: number }> {
  if (!isFirebaseConfigured()) return { rooms: 0, communityGames: 0 };
  try {
    const [r, g] = await Promise.all([
      getCountFromServer(collection(getDb(), "rooms")),
      getCountFromServer(collection(getDb(), "games")),
    ]);
    return { rooms: r.data().count, communityGames: g.data().count };
  } catch {
    return { rooms: 0, communityGames: 0 };
  }
}
