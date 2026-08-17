"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AuthPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const { user, configured, signInGoogle, signInGuest } = useAuth();
  const [busy, setBusy] = useState<null | "google" | "guest">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.replace("/profil");
  }, [user, router]);

  async function run(kind: "google" | "guest") {
    setError(null);
    setBusy(kind);
    try {
      if (kind === "google") await signInGoogle();
      else await signInGuest();
      // redirect handled by the effect once user is set
    } catch {
      setBusy(null);
      setError("⚠️ " + t("notConfigured"));
    }
  }

  return (
    <div className="wrap">
      <div className="auth-wrap">
        <h1>{t("loginTitle")}</h1>
        <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 14, marginTop: -8, marginBottom: 20 }}>
          {t("subtitle")}
        </p>

        {!configured && <div className="auth-note">🔒 {t("notConfigured")}</div>}

        <button
          className="btn btn-p"
          style={{ width: "100%", justifyContent: "center", padding: 14 }}
          disabled={busy !== null || !configured}
          onClick={() => run("google")}
        >
          🔵 {busy === "google" ? "…" : t("google")}
        </button>

        <div className="divider">{t("or")}</div>

        <button
          className="btn btn-g"
          style={{ width: "100%", justifyContent: "center", padding: 14 }}
          disabled={busy !== null || !configured}
          onClick={() => run("guest")}
        >
          👤 {busy === "guest" ? "…" : t("guest")}
        </button>

        {error && <p style={{ color: "#ff6b81", fontSize: 13, marginTop: 14, textAlign: "center" }}>{error}</p>}

        {!configured && (
          <div className="auth-alt" style={{ marginTop: 16 }}>
            <Link href="/profil">{t("demoProfile")} →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
