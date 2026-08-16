import type { Locale } from "@/i18n/routing";

export type GameCategory = "arcade" | "puzzle" | "reflex";

export interface Game {
  slug: string;
  title: string;
  category: GameCategory;
  tags: string[];
  premium: boolean;
  /** CSS class for the gradient cover (see globals.css .c1/.c2/.c3...). */
  cover: string;
  /** Emoji shown large on the cover as lightweight art. */
  emoji: string;
  plays: number;
  minAge: number;
  featured?: boolean;
  trend?: number;
  /** Relative path to the sandboxed game bundle. */
  entry: string;
  /** Short marketing line per locale (used on cards + meta description). */
  short: Record<Locale, string>;
  /** Longer unique description per locale (SEO body). */
  about: Record<Locale, string>;
}

export const GAMES: Game[] = [
  {
    slug: "2048",
    title: "2048",
    category: "puzzle",
    tags: ["puzzle", "numbers", "brain"],
    premium: false,
    cover: "c1",
    emoji: "🔢",
    plays: 32100,
    minAge: 6,
    featured: true,
    trend: 1,
    entry: "/games/2048/index.html",
    short: {
      tr: "Sayıları birleştir, 2048'e ulaş. Bağımlılık yapan klasik bulmaca.",
      en: "Merge the numbers and reach 2048. The addictive classic puzzle.",
      es: "Combina los números y llega a 2048. El clásico puzzle adictivo.",
      zh: "合并数字，冲向 2048。令人上瘾的经典益智游戏。",
    },
    about: {
      tr: "2048, aynı sayıları kaydırıp birleştirerek 2048 karesine ulaşmaya çalıştığın basit ama bağımlılık yapan bir bulmaca oyunudur. Ok tuşları veya kaydırma ile oyna; her hamlede yeni bir kare belirir. İndirme yok, kayıt yok — tarayıcında hemen başla.",
      en: "2048 is a simple yet addictive puzzle where you slide and merge matching numbers to reach the 2048 tile. Play with arrow keys or swipe; a new tile appears after every move. No downloads, no sign-up — start right in your browser.",
      es: "2048 es un puzzle sencillo pero adictivo en el que deslizas y combinas números iguales para llegar a la casilla 2048. Juega con las flechas o deslizando; aparece una nueva ficha en cada movimiento. Sin descargas ni registro: empieza en tu navegador.",
      zh: "2048 是一款简单却令人上瘾的益智游戏，通过滑动合并相同的数字，目标是拼出 2048 方块。使用方向键或滑动操作，每一步都会出现新方块。无需下载、无需注册，直接在浏览器开玩。",
    },
  },
  {
    slug: "hafiza",
    title: "Hafıza Kartları",
    category: "puzzle",
    tags: ["memory", "brain", "kids"],
    premium: false,
    cover: "c4",
    emoji: "🧠",
    plays: 21800,
    minAge: 4,
    featured: true,
    entry: "/games/memory/index.html",
    short: {
      tr: "Eş kartları bul, hafızanı test et. Her yaşa uygun.",
      en: "Find the matching pairs and test your memory. Fun for all ages.",
      es: "Encuentra las parejas y pon a prueba tu memoria. Para todas las edades.",
      zh: "找出配对卡片，考验你的记忆力。适合所有年龄。",
    },
    about: {
      tr: "Hafıza Kartları, kartları çevirip eşlerini bularak tamamladığın klasik bir hafıza oyunudur. Ne kadar az hamlede bitirirsen skorun o kadar yüksek olur. Çocuklar ve yetişkinler için ideal, tarayıcıda anında oynanır.",
      en: "Memory Cards is a classic concentration game where you flip cards and find their matching pairs. The fewer moves you make, the higher your score. Perfect for kids and adults alike, playable instantly in the browser.",
      es: "Cartas de Memoria es un juego clásico de concentración en el que giras las cartas y encuentras sus parejas. Cuantos menos movimientos hagas, mayor será tu puntuación. Perfecto para niños y adultos, se juega al instante en el navegador.",
      zh: "记忆翻牌是一款经典的专注力游戏，翻开卡片并找出配对。用的步数越少，得分越高。适合儿童和成人，在浏览器中即点即玩。",
    },
  },
  {
    slug: "yilan",
    title: "Yılan",
    category: "arcade",
    tags: ["arcade", "classic", "reflex"],
    premium: false,
    cover: "c2",
    emoji: "🐍",
    plays: 28400,
    minAge: 5,
    trend: 2,
    entry: "/games/snake/index.html",
    short: {
      tr: "Yemleri topla, uzadıkça zorlaş. Ölümsüz arcade klasiği.",
      en: "Eat the food, grow longer, survive. The timeless arcade classic.",
      es: "Come la comida, crece y sobrevive. El clásico arcade eterno.",
      zh: "吃食物、变长、活下去。永不过时的街机经典。",
    },
    about: {
      tr: "Yılan, yemleri toplayarak büyüyen yılanı duvarlara ve kendine çarpmadan yönettiğin efsanevi arcade oyunudur. Uzadıkça oyun zorlaşır. Ok tuşları veya kaydırma ile kontrol et, yüksek skoru yakala.",
      en: "Snake is the legendary arcade game where you guide a growing snake to eat food without hitting the walls or itself. The longer you get, the harder it becomes. Control with arrow keys or swipe and chase the high score.",
      es: "Snake es el legendario juego arcade en el que guías a una serpiente que crece comiendo sin chocar con las paredes ni consigo misma. Cuanto más creces, más difícil se vuelve. Controla con las flechas o deslizando y persigue la máxima puntuación.",
      zh: "贪吃蛇是传奇般的街机游戏，你要操控不断变长的蛇吃food，同时避免撞墙或撞到自己。蛇越长越难。用方向键或滑动操作，挑战最高分。",
    },
  },
];

export function getAllGames(): Game[] {
  return GAMES;
}

export function getGame(slug: string): Game | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export function getGamesByCategory(category: GameCategory): Game[] {
  return GAMES.filter((g) => g.category === category);
}

export const CATEGORIES: GameCategory[] = ["arcade", "puzzle", "reflex"];

export function formatPlays(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
