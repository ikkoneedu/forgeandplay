import { getDb } from "./db";
import { isFirebaseConfigured } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  onSnapshot,
  query,
  where,
  runTransaction,
} from "firebase/firestore";

export interface RoomMember {
  uid: string;
  name: string;
  color: string;
}

export interface Room {
  id: string;
  gameSlug: string;
  mode: string;
  platform: string;
  rank: string;
  mic: boolean;
  lang: string;
  capacity: number;
  members: RoomMember[];
  ownerId: string;
  ownerName: string;
  createdAt: number;
  ageRestricted?: boolean;
}

export interface ChatMessage {
  id: string;
  uid: string;
  name: string;
  color: string;
  text: string;
  createdAt: number;
  /** BCP-47 base language of the message (for auto-translation), e.g. "tr". */
  lang?: string;
}

export function roomsSupported(): boolean {
  return isFirebaseConfigured();
}

export function listenRooms(gameSlug: string, cb: (rooms: Room[]) => void): () => void {
  const q = query(collection(getDb(), "rooms"), where("gameSlug", "==", gameSlug));
  return onSnapshot(
    q,
    (snap) => {
      const rooms = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Room, "id">) }));
      rooms.sort((a, b) => b.createdAt - a.createdAt);
      cb(rooms);
    },
    () => cb([])
  );
}

export async function createRoom(data: Omit<Room, "id" | "createdAt">): Promise<string> {
  const id = `${data.gameSlug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
  await setDoc(doc(getDb(), "rooms", id), { ...data, createdAt: Date.now() });
  return id;
}

export async function joinRoom(roomId: string, member: RoomMember): Promise<void> {
  const ref = doc(getDb(), "rooms", roomId);
  await runTransaction(getDb(), async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) return;
    const room = s.data() as Room;
    if (room.members.some((m) => m.uid === member.uid)) return;
    if (room.members.length >= room.capacity) return;
    tx.update(ref, { members: [...room.members, member] });
  });
}

export async function leaveRoom(roomId: string, uid: string): Promise<void> {
  const ref = doc(getDb(), "rooms", roomId);
  await runTransaction(getDb(), async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists()) return;
    const room = s.data() as Room;
    const members = room.members.filter((m) => m.uid !== uid);
    if (members.length === 0) tx.delete(ref);
    else tx.update(ref, { members });
  });
}

export async function deleteRoom(roomId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "rooms", roomId));
}

export function listenChat(roomId: string, cb: (msgs: ChatMessage[]) => void): () => void {
  const q = collection(getDb(), "rooms", roomId, "messages");
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, "id">) }));
      msgs.sort((a, b) => a.createdAt - b.createdAt);
      cb(msgs);
    },
    () => cb([])
  );
}

export async function sendMessage(
  roomId: string,
  msg: Omit<ChatMessage, "id" | "createdAt">
): Promise<void> {
  await addDoc(collection(getDb(), "rooms", roomId, "messages"), {
    ...msg,
    createdAt: Date.now(),
  });
}
