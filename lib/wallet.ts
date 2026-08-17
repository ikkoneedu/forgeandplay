import { getDb } from "./db";
import { isFirebaseConfigured } from "./firebase";
import { doc, getDoc, setDoc, onSnapshot, runTransaction } from "firebase/firestore";

export function walletSupported(): boolean {
  return isFirebaseConfigured();
}

export function listenBalance(uid: string, cb: (n: number) => void): () => void {
  return onSnapshot(
    doc(getDb(), "users", uid),
    (s) => cb(s.exists() ? (s.data().balance as number) || 0 : 0),
    () => cb(0)
  );
}

export async function ensureUserDoc(uid: string, name: string): Promise<void> {
  const ref = doc(getDb(), "users", uid);
  const s = await getDoc(ref);
  if (!s.exists()) {
    await setDoc(ref, { balance: 0, name, createdAt: Date.now() });
  }
}

/**
 * Demo top-up. Real deposits will replace this via a licensed payment
 * provider (iyzico/Stripe) + server-side (Cloud Functions) verification.
 */
export async function addFunds(uid: string, amount: number): Promise<void> {
  await runTransaction(getDb(), async (tx) => {
    const ref = doc(getDb(), "users", uid);
    const s = await tx.get(ref);
    const bal = s.exists() ? (s.data().balance as number) || 0 : 0;
    tx.set(ref, { balance: bal + amount }, { merge: true });
  });
}
