import type { Locale } from "@/i18n/routing";

export interface LfgGame {
  slug: string;
  name: string;
  emoji: string;
  cover: string; // gradient cover class
  platforms: string[];
  ranks: string[];
  modes: string[];
  players: number; // demo "active players"
  featured?: boolean;
}

export interface DemoMember {
  initial: string;
  color: string; // avatar class a-o / a-v / a-c
}

export interface DemoRoom {
  id: string;
  gameSlug: string;
  mode: string;
  platform: string;
  rank: string;
  mic: boolean;
  lang: string;
  capacity: number;
  members: DemoMember[];
  owner: string;
  ageRestricted?: boolean;
}

export const LFG_GAMES: LfgGame[] = [
  {
    slug: "cs2",
    name: "CS2",
    emoji: "🔫",
    cover: "a-o",
    platforms: ["Steam", "PC"],
    ranks: ["Silver", "Gold Nova", "MG", "DMG", "Eagle", "Global"],
    modes: ["Premier", "Competitive", "Wingman"],
    players: 1840,
    featured: true,
  },
  {
    slug: "valorant",
    name: "Valorant",
    emoji: "🎯",
    cover: "a-v",
    platforms: ["Riot", "PC"],
    ranks: ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Immortal", "Radiant"],
    modes: ["Competitive", "Unrated", "Swiftplay"],
    players: 2110,
    featured: true,
  },
  {
    slug: "league-of-legends",
    name: "League of Legends",
    emoji: "⚔️",
    cover: "c1",
    platforms: ["Riot", "PC"],
    ranks: ["Iron", "Bronze", "Silver", "Gold", "Platinum", "Emerald", "Diamond", "Master"],
    modes: ["Ranked Solo", "Ranked Flex", "Normal", "ARAM"],
    players: 1620,
    featured: true,
  },
  {
    slug: "fortnite",
    name: "Fortnite",
    emoji: "🛠️",
    cover: "c3",
    platforms: ["Epic", "PC", "PS5", "Xbox"],
    ranks: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Elite", "Champion", "Unreal"],
    modes: ["Battle Royale", "Zero Build", "Duos", "Squads"],
    players: 1490,
  },
  {
    slug: "rocket-league",
    name: "Rocket League",
    emoji: "🚗",
    cover: "a-c",
    platforms: ["Epic", "PC", "PS5", "Xbox"],
    ranks: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Champion", "GC", "SSL"],
    modes: ["2v2", "3v3", "1v1", "Rumble"],
    players: 980,
  },
  {
    slug: "apex-legends",
    name: "Apex Legends",
    emoji: "🎖️",
    cover: "c2",
    platforms: ["Steam", "PC", "PS5", "Xbox"],
    ranks: ["Rookie", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Predator"],
    modes: ["Trios", "Duos", "Ranked", "Mixtape"],
    players: 870,
  },
  {
    slug: "fc25",
    name: "EA FC 25",
    emoji: "⚽",
    cover: "c4",
    platforms: ["PS5", "Xbox", "PC"],
    ranks: ["Div 10", "Div 7", "Div 5", "Div 3", "Div 1", "Elite"],
    modes: ["Ultimate Team", "Co-op Seasons", "Pro Clubs"],
    players: 760,
  },
  {
    slug: "pubg",
    name: "PUBG",
    emoji: "🪂",
    cover: "a-o",
    platforms: ["Steam", "PC", "PS5", "Xbox"],
    ranks: ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Master", "Grandmaster"],
    modes: ["Squad", "Duo", "Solo", "TPP", "FPP"],
    players: 690,
  },
];

export function getLfgGame(slug: string): LfgGame | undefined {
  return LFG_GAMES.find((g) => g.slug === slug);
}

export function getAllLfgGames(): LfgGame[] {
  return LFG_GAMES;
}

const AV_COLORS = ["a-o", "a-v", "a-c"];
const NAMES = ["Kaan", "Zephyr", "Ace", "Nova", "Blaze", "Mira", "Vortex", "Echo", "Reyn", "Lux"];

/** Deterministic-ish demo rooms for a game so pages are stable and SSG-friendly. */
export function demoRoomsFor(game: LfgGame): DemoRoom[] {
  const langs = ["🇹🇷 TR", "🇬🇧 EN", "🇪🇺 EU"];
  const rooms: DemoRoom[] = [];
  const count = 5;
  for (let i = 0; i < count; i++) {
    const cap = [3, 4, 5, 5, 2][i % 5];
    const filled = Math.max(1, (i * 2 + 1) % cap || 1);
    const members: DemoMember[] = Array.from({ length: filled }, (_, k) => ({
      initial: NAMES[(i * 3 + k) % NAMES.length][0],
      color: AV_COLORS[(i + k) % AV_COLORS.length],
    }));
    rooms.push({
      id: `${game.slug}-${i + 1}`,
      gameSlug: game.slug,
      mode: game.modes[i % game.modes.length],
      platform: game.platforms[i % game.platforms.length],
      rank: game.ranks[(i * 2) % game.ranks.length],
      mic: i % 3 !== 0,
      lang: langs[i % langs.length],
      capacity: cap,
      members,
      owner: NAMES[i % NAMES.length],
      ageRestricted: i % 4 === 0,
    });
  }
  return rooms;
}

export function seededChat(locale: Locale): { user: string; text: string; color: string }[] {
  const byLocale: Record<Locale, { user: string; text: string }[]> = {
    tr: [
      { user: "Kaan", text: "Selam, mikrofon açık olan var mı?" },
      { user: "Nova", text: "Ben varım, hangi moddayız?" },
      { user: "Ace", text: "Premier oynayalım, sıralı gidelim 👍" },
    ],
    en: [
      { user: "Kaan", text: "Hey, anyone on mic?" },
      { user: "Nova", text: "I'm in, which mode are we running?" },
      { user: "Ace", text: "Let's do Premier, queue up 👍" },
    ],
    es: [
      { user: "Kaan", text: "Hola, ¿alguien con micro?" },
      { user: "Nova", text: "Yo entro, ¿qué modo jugamos?" },
      { user: "Ace", text: "Vamos a Premier, a la cola 👍" },
    ],
    zh: [
      { user: "Kaan", text: "嗨，有人开麦吗？" },
      { user: "Nova", text: "我加入，我们打什么模式？" },
      { user: "Ace", text: "打 Premier 吧，排队 👍" },
    ],
  };
  return byLocale[locale].map((m, i) => ({
    ...m,
    color: AV_COLORS[i % AV_COLORS.length],
  }));
}
