export interface Tournament {
  slug: string;
  name: string;
  game: string;
  emoji: string;
  cover: string;
  mode: string;
  prize: string;
  /** ISO date */
  date: string;
  slots: number;
  filled: number;
  premium: boolean;
}

/** Demo tournaments (dates roll forward from "now" at render time). */
export function getTournaments(): Tournament[] {
  const day = 86400000;
  const now = Date.now();
  const iso = (offset: number) => new Date(now + offset * day).toISOString();
  return [
    {
      slug: "cs2-weekly-premier",
      name: "CS2 Haftalık Premier Kupası",
      game: "CS2",
      emoji: "🔫",
      cover: "a-o",
      mode: "5v5 Premier",
      prize: "₺2.500",
      date: iso(3),
      slots: 32,
      filled: 21,
      premium: false,
    },
    {
      slug: "valorant-clash",
      name: "Valorant Clash Night",
      game: "Valorant",
      emoji: "🎯",
      cover: "a-v",
      mode: "5v5 Rekabetçi",
      prize: "₺3.000",
      date: iso(5),
      slots: 24,
      filled: 18,
      premium: true,
    },
    {
      slug: "rocket-league-3v3",
      name: "Rocket League 3v3 Arena",
      game: "Rocket League",
      emoji: "🚗",
      cover: "a-c",
      mode: "3v3",
      prize: "₺1.500",
      date: iso(7),
      slots: 16,
      filled: 9,
      premium: false,
    },
    {
      slug: "fc25-cup",
      name: "EA FC 25 Ultimate Cup",
      game: "EA FC 25",
      emoji: "⚽",
      cover: "c4",
      mode: "1v1",
      prize: "₺2.000",
      date: iso(10),
      slots: 64,
      filled: 40,
      premium: false,
    },
  ];
}
