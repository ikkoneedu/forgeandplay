"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  watchAuth,
  loginWithGoogle,
  loginAsGuest,
  logout,
  isFirebaseConfigured,
  type User,
} from "@/lib/auth";
import { ensureUserDoc, listenBalance, addFunds } from "@/lib/wallet";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  balance: number;
  signInGoogle: () => Promise<void>;
  signInGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  addBalance: (amount: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  configured: false,
  balance: 0,
  signInGoogle: async () => {},
  signInGuest: async () => {},
  signOut: async () => {},
  addBalance: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const unsub = watchAuth((u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, [configured]);

  useEffect(() => {
    if (!configured || !user) {
      setBalance(0);
      return;
    }
    ensureUserDoc(user.uid, user.displayName || (user.isAnonymous ? "Misafir" : user.email || "")).catch(() => {});
    return listenBalance(user.uid, setBalance);
  }, [configured, user]);

  const value: AuthContextValue = {
    user,
    loading,
    configured,
    balance,
    signInGoogle: async () => {
      await loginWithGoogle();
    },
    signInGuest: async () => {
      await loginAsGuest();
    },
    signOut: async () => {
      await logout();
    },
    addBalance: async (amount: number) => {
      if (user) await addFunds(user.uid, amount);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
