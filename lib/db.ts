import { getFirestore } from "firebase/firestore";
import { getFirebaseApp } from "./firebase";

export function getDb() {
  return getFirestore(getFirebaseApp());
}
