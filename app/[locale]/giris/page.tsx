"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { isFirebaseConfigured } from "@/lib/firebase";

export default function AuthPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const configured = isFirebaseConfigured();

  return (
    <div className="wrap">
      <div className="auth-wrap">
        <h1>{mode === "login" ? t("loginTitle") : t("registerTitle")}</h1>

        {!configured && (
          <div className="auth-note">🔒 {t("notConfigured")}</div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Firebase Auth wires up here once configured.
            if (!configured) router.push("/profil");
          }}
        >
          {mode === "register" && (
            <div className="field">
              <label>{t("name")}</label>
              <input name="name" autoComplete="username" />
            </div>
          )}
          <div className="field">
            <label>{t("email")}</label>
            <input name="email" type="email" autoComplete="email" />
          </div>
          <div className="field">
            <label>{t("password")}</label>
            <input name="password" type="password" autoComplete="current-password" />
          </div>
          <button type="submit" className="btn btn-p">
            {mode === "login" ? t("login") : t("register")}
          </button>
        </form>

        <div className="divider">{t("or")}</div>
        <button className="btn btn-g" style={{ width: "100%", justifyContent: "center", padding: 13 }}>
          🔵 {t("google")}
        </button>

        <div className="auth-alt">
          <a onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? t("toRegister") : t("toLogin")}
          </a>
        </div>

        {!configured && (
          <div className="auth-alt" style={{ marginTop: 10 }}>
            <Link href="/profil">{t("demoProfile")} →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
