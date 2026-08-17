"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { LfgGame, DemoRoom } from "@/lib/lfg";
import { seededChat } from "@/lib/lfg";
import type { Locale } from "@/i18n/routing";
import { useAuth } from "@/components/auth/AuthProvider";
import { loginAsGuest } from "@/lib/auth";
import {
  roomsSupported,
  listenRooms,
  createRoom,
  joinRoom,
  leaveRoom,
  listenChat,
  sendMessage,
  type Room,
  type RoomMember,
  type ChatMessage,
} from "@/lib/lfgRooms";

const YOU: Record<string, string> = { tr: "Sen", en: "You", es: "Tú", zh: "你" };
const AV = ["a-o", "a-v", "a-c"];
const pickColor = () => AV[Math.floor(Math.random() * AV.length)];

function demoToRoom(d: DemoRoom, i: number): Room {
  return {
    id: d.id,
    gameSlug: d.gameSlug,
    mode: d.mode,
    platform: d.platform,
    rank: d.rank,
    mic: d.mic,
    lang: d.lang,
    capacity: d.capacity,
    members: d.members.map((m, k) => ({ uid: `demo-${i}-${k}`, name: m.initial, color: m.color })),
    ownerId: "demo",
    ownerName: d.owner,
    createdAt: Date.now() - i,
    ageRestricted: d.ageRestricted,
  };
}

export default function RoomsBoard({
  game,
  initialRooms,
}: {
  game: LfgGame;
  initialRooms: DemoRoom[];
}) {
  const t = useTranslations("lfg");
  const tAuth = useTranslations("auth");
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  const live = roomsSupported();
  const you = YOU[locale] || "You";

  const [rooms, setRooms] = useState<Room[]>(() =>
    live ? [] : initialRooms.map(demoToRoom)
  );
  const [platform, setPlatform] = useState("all");
  const [rank, setRank] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [active, setActive] = useState<Room | null>(null);

  useEffect(() => {
    if (!live) return;
    return listenRooms(game.slug, setRooms);
  }, [live, game.slug]);

  // keep the open room's member list fresh from the live list
  useEffect(() => {
    if (!active) return;
    const fresh = rooms.find((r) => r.id === active.id);
    if (fresh && fresh !== active) setActive(fresh);
    if (!fresh && live) setActive(null);
  }, [rooms, active, live]);

  async function ensureUser(): Promise<{ uid: string; name: string }> {
    if (user) return { uid: user.uid, name: user.displayName || you };
    const u = await loginAsGuest();
    return { uid: u.uid, name: u.displayName || you };
  }

  const filtered = useMemo(
    () =>
      rooms.filter(
        (r) =>
          (platform === "all" || r.platform === platform) &&
          (rank === "all" || r.rank === rank)
      ),
    [rooms, platform, rank]
  );

  async function join(room: Room) {
    if (room.members.length >= room.capacity && !room.members.some((m) => m.uid === user?.uid)) {
      setActive(room);
      return;
    }
    const me = await ensureUser();
    const member: RoomMember = { uid: me.uid, name: me.name, color: pickColor() };
    if (live) {
      await joinRoom(room.id, member);
      setActive(room);
    } else {
      const updated = {
        ...room,
        members: room.members.some((m) => m.uid === me.uid)
          ? room.members
          : [...room.members, member],
      };
      setRooms((rs) => rs.map((r) => (r.id === room.id ? updated : r)));
      setActive(updated);
    }
  }

  async function submitCreate(form: FormData) {
    const me = await ensureUser();
    const base: Omit<Room, "id" | "createdAt"> = {
      gameSlug: game.slug,
      mode: String(form.get("mode")),
      platform: String(form.get("platform")),
      rank: String(form.get("rank")),
      mic: form.get("mic") === "on",
      lang: "🇹🇷 TR",
      capacity: Number(form.get("capacity")) || 5,
      members: [{ uid: me.uid, name: me.name, color: pickColor() }],
      ownerId: me.uid,
      ownerName: me.name,
    };
    setShowCreate(false);
    if (live) {
      const id = await createRoom(base);
      setActive({ ...base, id, createdAt: Date.now() });
    } else {
      const room: Room = { ...base, id: `new-${Date.now()}`, createdAt: Date.now() };
      setRooms((rs) => [room, ...rs]);
      setActive(room);
    }
  }

  async function onLeave(room: Room) {
    if (live && user) await leaveRoom(room.id, user.uid);
    setActive(null);
  }

  return (
    <>
      <div className="demo-note">
        {live ? "🟢 " + t("hub.roomsTitle") : "✦ " + t("demo")}
      </div>

      <div className="sec-h" style={{ marginTop: 6, marginBottom: 8 }}>
        <h2 style={{ fontSize: 22 }}>{t("hub.roomsTitle")}</h2>
        <button
          className="btn btn-p"
          style={{ padding: "10px 18px", fontSize: 14 }}
          onClick={() => setShowCreate((s) => !s)}
        >
          ＋ {t("hub.create")}
        </button>
      </div>

      {showCreate && (
        <form
          className="create-panel"
          onSubmit={(e) => {
            e.preventDefault();
            submitCreate(new FormData(e.currentTarget));
          }}
        >
          <div className="field">
            <label>{t("create.mode")}</label>
            <select name="mode" defaultValue={game.modes[0]}>
              {game.modes.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t("create.platform")}</label>
            <select name="platform" defaultValue={game.platforms[0]}>
              {game.platforms.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t("create.rank")}</label>
            <select name="rank" defaultValue={game.ranks[0]}>
              {game.ranks.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{t("create.capacity")}</label>
            <select name="capacity" defaultValue="5">
              {[2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}
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
          {game.platforms.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className="sel" value={rank} onChange={(e) => setRank(e.target.value)}>
          <option value="all">{t("hub.rank")}: {t("hub.all")}</option>
          {game.ranks.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="games-empty">{t("hub.empty")}</p>
      ) : (
        <div className="rooms-list">
          {filtered.map((room) => {
            const full = room.members.length >= room.capacity;
            const joined = !!user && room.members.some((m) => m.uid === user.uid);
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
                      <div key={i} className={`av ${m.color}`}>{m.name[0]}</div>
                    ))}
                    <span className="slots">{t("hub.players", { filled: room.members.length, cap: room.capacity })}</span>
                  </div>
                  <button className="rjoin" disabled={full && !joined} onClick={() => join(room)}>
                    {joined ? t("room.chat") : full ? t("hub.full") : t("hub.join")}
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
          live={live}
          you={you}
          me={user ? { uid: user.uid, name: user.displayName || you } : null}
          seeded={seededChat(locale)}
          onClose={() => setActive(null)}
          onLeave={() => onLeave(active)}
          t={t}
          tAuth={tAuth}
          ensureUser={ensureUser}
        />
      )}
      <div style={{ height: 40 }} />
    </>
  );
}

function RoomChat({
  game,
  room,
  live,
  you,
  me,
  seeded,
  onClose,
  onLeave,
  t,
  tAuth,
  ensureUser,
}: {
  game: LfgGame;
  room: Room;
  live: boolean;
  you: string;
  me: { uid: string; name: string } | null;
  seeded: { user: string; text: string; color: string }[];
  onClose: () => void;
  onLeave: () => void;
  t: ReturnType<typeof useTranslations>;
  tAuth: ReturnType<typeof useTranslations>;
  ensureUser: () => Promise<{ uid: string; name: string }>;
}) {
  const [localMsgs, setLocalMsgs] = useState(
    seeded.map((m, i) => ({ id: `s${i}`, uid: `seed-${i}`, name: m.user, color: m.color, text: m.text, createdAt: i }))
  );
  const [liveMsgs, setLiveMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!live) return;
    return listenChat(room.id, setLiveMsgs);
  }, [live, room.id]);

  const msgs = live ? liveMsgs : localMsgs;

  useEffect(() => {
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }));
  }, [msgs.length]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (live) {
      const u = await ensureUser();
      await sendMessage(room.id, { uid: u.uid, name: u.name, color: "a-v", text });
    } else {
      setLocalMsgs((m) => [
        ...m,
        { id: `l${Date.now()}`, uid: "me", name: you, color: "a-v", text, createdAt: Date.now() },
      ]);
    }
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <b>{game.emoji} {game.name} · {room.mode}</b>
            <small>{t("room.chat")} · {t("hub.players", { filled: room.members.length, cap: room.capacity })}</small>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {live && me && room.members.some((m) => m.uid === me.uid) && (
              <button className="btn btn-g" style={{ padding: "6px 10px", fontSize: 11 }} onClick={onLeave}>
                {t("room.leave")}
              </button>
            )}
            <button className="iconbtn" onClick={onClose} aria-label="close">×</button>
          </div>
        </div>
        <div className="drawer-body" ref={bodyRef}>
          {msgs.map((m) => (
            <div key={m.id} className={`msg ${me && m.uid === me.uid ? "me" : ""}`}>
              <div className={`av ${m.color}`}>{m.name[0]}</div>
              <div className="bubble">
                <div className="u">{m.name}</div>
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
