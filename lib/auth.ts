import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { getFirebaseApp, isFirebaseConfigured } from "./firebase";

export function firebaseAuth() {
  return getAuth(getFirebaseApp());
}

export async function loginWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const res = await signInWithPopup(firebaseAuth(), provider);
  return res.user;
}

export async function loginAsGuest(): Promise<User> {
  const res = await signInAnonymously(firebaseAuth());
  return res.user;
}

export async function logout(): Promise<void> {
  await signOut(firebaseAuth());
}

export function watchAuth(cb: (user: User | null) => void): () => void {
  if (!isFirebaseConfigured()) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(firebaseAuth(), cb);
}

export { isFirebaseConfigured };
export type { User };
