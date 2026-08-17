"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { CATEGORIES } from "@/lib/games";
import { addUserGame } from "@/lib/userGames";
import { useAuth } from "@/components/auth/AuthProvider";

export default function UploadForm() {
  const t = useTranslations("community");
  const tPortal = useTranslations("portal");
  const router = useRouter();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const title = String(form.get("title") || "");
    const html = String(form.get("html") || "");
    if (!title.trim()) return setError(t("form.errName"));
    if (!html.trim()) return setError(t("form.errHtml"));

    setBusy(true);
    try {
      const game = await addUserGame({
        title,
        author: String(form.get("author") || ""),
        ownerId: user?.uid ?? "local",
        category: String(form.get("category")) as (typeof CATEGORIES)[number],
        emoji: String(form.get("emoji") || "🎮"),
        minAge: Number(form.get("age")) || 7,
        html,
      });
      router.push(`/topluluk/${game.id}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error && err.message === "size" ? t("form.errSize") : t("form.errHtml"));
    }
  }

  return (
    <div className="wrap">
      <nav className="breadcrumb" aria-label="breadcrumb">
        <Link href="/">Forge&amp;Play</Link>
        <span>/</span>
        <Link href="/topluluk">{t("title")}</Link>
        <span>/</span>
        <span>{t("upload")}</span>
      </nav>

      <header className="page-head" style={{ paddingBottom: 6 }}>
        <h1>
          ＋ <span className="g">{t("upload")}</span>
        </h1>
        <p>{t("howTo")}</p>
      </header>

      <div className="demo-note" style={{ marginBottom: 16 }}>🔒 {t("safety")}</div>

      <form onSubmit={onSubmit} style={{ maxWidth: 760 }}>
        <div className="create-panel" style={{ marginTop: 0 }}>
          <div className="field">
            <label>{t("form.fname")}</label>
            <input name="title" maxLength={80} required />
          </div>
          <div className="field">
            <label>{t("form.fauthor")}</label>
            <input name="author" maxLength={40} placeholder="Anonim" />
          </div>
          <div className="field">
            <label>{t("form.fcategory")}</label>
            <select name="category" defaultValue={CATEGORIES[1]}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{tPortal(`cat.${c}`)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("form.fage")}</label>
            <select name="age" defaultValue="7">
              {[4, 7, 12, 16, 18].map((a) => (
                <option key={a} value={a}>{a}+</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("form.femoji")}</label>
            <input name="emoji" maxLength={4} defaultValue="🎮" />
          </div>
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>{t("form.fhtml")}</label>
          <textarea
            name="html"
            required
            spellCheck={false}
            placeholder="<!doctype html> …"
            style={{
              minHeight: 260,
              background: "var(--bg2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: "12px 14px",
              color: "var(--text)",
              fontFamily: "ui-monospace, monospace",
              fontSize: 13,
              resize: "vertical",
            }}
          />
          <small style={{ color: "var(--muted2)", fontSize: 12 }}>{t("form.fhtmlHint")}</small>
        </div>

        {error && (
          <p style={{ color: "#ff6b81", fontSize: 14, marginTop: 12 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button type="submit" className="btn btn-p" style={{ padding: "13px 26px" }} disabled={busy}>
            {busy ? t("form.publishing") : t("form.submit")}
          </button>
          <Link href="/topluluk" className="btn btn-g" style={{ padding: "13px 22px" }}>
            {t("form.back")}
          </Link>
        </div>
      </form>
      <div style={{ height: 60 }} />
    </div>
  );
}
