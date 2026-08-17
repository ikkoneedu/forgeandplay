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

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInGoogle: () => Promise<void>;
  signInGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  configured: false,
  signInGoogle: async () => {},
  signInGuest: async () => {},
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);

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

  const value: AuthContextValue = {
    user,
    loading,
    configured,
    signInGoogle: async () => {
      await loginWithGoogle();
    },
    signInGuest: async () => {
      await loginAsGuest();
    },
    signOut: async () => {
      await logout();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
