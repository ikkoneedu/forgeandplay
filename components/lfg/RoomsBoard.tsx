"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LfgGame, DemoRoom, DemoMember } from "@/lib/lfg";
import { seededChat } from "@/lib/lfg";
import type { Locale } from "@/i18n/routing";

const YOU: Record<string, string> = { tr: "Sen", en: "You", es: "Tú", zh: "你" };

interface ChatMsg {
  user: string;
  text: string;
  color: string;
  me?: boolean;
}

export default function RoomsBoard({
  game,
  initialRooms,
}: {
  game: LfgGame;
  initialRooms: DemoRoom[];
}) {
  const t = useTranslations("lfg");
  const locale = useLocale() as Locale;
  const you = YOU[locale] || "You";

  const [rooms, setRooms] = useState<DemoRoom[]>(initialRooms);
  const [platform, setPlatform] = useState("all");
  const [rank, setRank] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [active, setActive] = useState<DemoRoom | null>(null);

  const filtered = useMemo(
    () =>
      rooms.filter(
        (r) =>
          (platform === "all" || r.platform === platform) &&
          (rank === "all" || r.rank === rank)
      ),
    [rooms, platform, rank]
  );

  function join(room: DemoRoom) {
    if (room.members.length < room.capacity) {
      const me: DemoMember = { initial: you[0], color: "a-v" };
      const updated = { ...room, members: [...room.members, me] };
      setRooms((rs) => rs.map((r) => (r.id === room.id ? updated : r)));
      setActive(updated);
    } else {
      setActive(room);
    }
  }

  function createRoom(form: FormData) {
    const room: DemoRoom = {
      id: `new-${Date.now()}`,
      gameSlug: game.slug,
      mode: String(form.get("mode")),
      platform: String(form.get("platform")),
      rank: String(form.get("rank")),
      mic: form.get("mic") === "on",
      lang: "🇹🇷 TR",
      capacity: Number(form.get("capacity")) || 5,
      members: [{ initial: you[0], color: "a-o" }],
      owner: you,
    };
    setRooms((rs) => [room, ...rs]);
    setShowCreate(false);
    setActive(room);
  }

  return (
    <>
      <div className="demo-note">✦ {t("demo")}</div>

      <div className="sec-h" style={{ marginTop: 6, marginBottom: 8 }}>
        <h2 style={{ fontSize: 22 }}>{t("hub.roomsTitle")}</h2>
        <button className="btn btn-p" style={{ padding: "10px 18px", fontSize: 14 }} onClick={() => setShowCreate((s) => !s)}>
          ＋ {t("hub.create")}
        </button>
      </div>

      {showCreate && (
        <form
          className="create-panel"
          onSubmit={(e) => {
            e.preventDefault();
            createRoom(new FormData(e.currentTarget));
          }}
        >
          <div className="field">
            <label>{t("create.mode")}</label>
            <select name="mode" defaultValue={game.modes[0]}>
              {game.modes.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("create.platform")}</label>
            <select name="platform" defaultValue={game.platforms[0]}>
              {game.platforms.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("create.rank")}</label>
            <select name="rank" defaultValue={game.ranks[0]}>
              {game.ranks.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t("create.capacity")}</label>
            <select name="capacity" defaultValue="5">
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="field check">
            <input type="checkbox" name="mic" id="mic" defaultChecked />
            <label htmlFor="mic">🎙 {t("create.mic")}</label>
          </div>
          <div className="create-actions">
            <button type="button" className="btn btn-g" style={{ padding: "10px 18px" }} onClick={() => setShowCreate(false)}>
              {t("create.cancel")}
            </button>
            <button type="submit" className="btn btn-p" style={{ padding: "10px 18px" }}>
              {t("create.submit")}
            </button>
          </div>
        </form>
      )}

      <div className="rooms-filters">
        <select className="sel" value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="all">{t("hub.platform")}: {t("hub.all")}</option>
          {game.platforms.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select className="sel" value={rank} onChange={(e) => setRank(e.target.value)}>
          <option value="all">{t("hub.rank")}: {t("hub.all")}</option>
          {game.ranks.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="games-empty">{t("hub.empty")}</p>
      ) : (
        <div className="rooms-list">
          {filtered.map((room) => {
            const full = room.members.length >= room.capacity;
            return (
              <div key={room.id} className="room-card">
                <div className="rtop">
                  <div className="rav">{game.emoji}</div>
                  <div>
                    <div className="rgame">{game.name} · {room.mode}</div>
                    <div className="rmode">{room.platform}</div>
                  </div>
                </div>
                <div className="room-tags">
                  {room.mic && <span className="pill">🎙 {t("hub.mic")}</span>}
                  <span className="pill">{room.lang}</span>
                  <span className="pill">{room.rank}</span>
                  {room.ageRestricted && <span className="pill">+18</span>}
                </div>
                <div className="room-foot">
                  <div className="avs">
                    {room.members.slice(0, 5).map((m, i) => (
                      <div key={i} className={`av ${m.color}`}>{m.initial}</div>
                    ))}
                    <span className="slots">{t("hub.players", { filled: room.members.length, cap: room.capacity })}</span>
                  </div>
                  <button className="rjoin" disabled={full} onClick={() => join(room)}>
                    {full ? t("hub.full") : t("hub.join")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {active && (
        <RoomChat
          game={game}
          room={active}
          you={you}
          seeded={seededChat(locale)}
          onClose={() => setActive(null)}
          t={t}
        />
      )}
      <div style={{ height: 40 }} />
    </>
  );
}

function RoomChat({
  game,
  room,
  you,
  seeded,
  onClose,
  t,
}: {
  game: LfgGame;
  room: DemoRoom;
  you: string;
  seeded: { user: string; text: string; color: string }[];
  onClose: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(seeded);
  const [input, setInput] = useState("");

  function send() {
    const text = input.trim();
    if (!text) return;
    setMsgs((m) => [...m, { user: you, text, color: "a-v", me: true }]);
    setInput("");
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <b>{game.emoji} {game.name} · {room.mode}</b>
            <small>{t("room.chat")} · {t("hub.players", { filled: room.members.length, cap: room.capacity })}</small>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="close">×</button>
        </div>
        <div className="drawer-body">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.me ? "me" : ""}`}>
              <div className={`av ${m.color}`}>{m.user[0]}</div>
              <div className="bubble">
                <div className="u">{m.user}</div>
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <div className="chat-input">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={t("room.placeholder")}
            aria-label={t("room.chat")}
          />
          <button className="btn btn-p" style={{ padding: "0 18px" }} onClick={send}>
            {t("room.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
