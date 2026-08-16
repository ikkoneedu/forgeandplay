"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export default function Assistant() {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: t("greeting") }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  async function sendText(text: string) {
    const clean = text.trim();
    if (!clean || loading) return;
    const next: Msg[] = [...msgs, { role: "user", content: clean }];
    setMsgs(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locale,
          messages: next.filter((m) => m.role === "user" || m.role === "assistant"),
        }),
      });
      const data = await res.json();
      const reply = data?.reply || t("demoReply");
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: t("demoReply") }]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
      });
    }
  }

  return (
    <>
      {open && (
        <div className="asst-panel" role="dialog" aria-label={t("title")}>
          <div className="asst-head">
            <div className="ic" aria-hidden="true">🧠</div>
            <b>{t("title")}</b>
            <button
              className="iconbtn"
              style={{ marginLeft: "auto" }}
              onClick={() => setOpen(false)}
              aria-label="close"
            >
              ×
            </button>
          </div>
          <div className="asst-body" ref={bodyRef}>
            {msgs.map((m, i) => (
              <div key={i} className={`msg ${m.role === "user" ? "me" : ""}`}>
                <div className={`av ${m.role === "user" ? "a-v" : "a-c"}`}>
                  {m.role === "user" ? "•" : "🧠"}
                </div>
                <div className="bubble">{m.content}</div>
              </div>
            ))}
            {loading && (
              <div className="msg">
                <div className="av a-c">🧠</div>
                <div className="bubble">…</div>
              </div>
            )}
          </div>
          {msgs.length <= 1 && (
            <div className="asst-sugs">
              <button className="asst-sug" onClick={() => sendText(t("s1"))}>{t("s1")}</button>
              <button className="asst-sug" onClick={() => sendText(t("s2"))}>{t("s2")}</button>
            </div>
          )}
          <div className="chat-input">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendText(input)}
              placeholder={t("placeholder")}
              aria-label={t("title")}
            />
            <button className="btn btn-p" style={{ padding: "0 16px" }} onClick={() => sendText(input)}>
              {t("send")}
            </button>
          </div>
        </div>
      )}
      <button
        className="asst-fab"
        onClick={() => setOpen((o) => !o)}
        aria-label={t("title")}
      >
        {open ? "×" : "🧠"}
      </button>
    </>
  );
}
