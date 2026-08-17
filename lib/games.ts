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
  {
    slug: "xox",
    title: "XOX",
    category: "puzzle",
    tags: ["strategy", "classic", "kids"],
    premium: false,
    cover: "c5",
    emoji: "⭕",
    plays: 15400,
    minAge: 4,
    entry: "/games/xox/index.html",
    short: {
      tr: "Klasik XOX — bilgisayara karşı üç taşı diz.",
      en: "Classic Tic-Tac-Toe — line up three against the computer.",
      es: "Tres en raya clásico — alinea tres contra la máquina.",
      zh: "经典井字棋 —— 与电脑对战连成三子。",
    },
    about: {
      tr: "XOX (Tic-Tac-Toe), bilgisayara karşı oynadığın klasik strateji oyunudur. Amacın üç taşını yatay, dikey veya çapraz diz. Her yaşa uygun, hızlı ve eğlenceli.",
      en: "Tic-Tac-Toe is the classic strategy game against the computer. Line up three of your marks horizontally, vertically or diagonally. Fun for all ages and quick to play.",
      es: "El tres en raya es el clásico juego de estrategia contra la máquina. Alinea tres de tus marcas en horizontal, vertical o diagonal. Divertido para todas las edades.",
      zh: "井字棋是与电脑对战的经典策略游戏。将你的三个棋子横、竖或斜连成一线即可获胜。老少皆宜，轻松上手。",
    },
  },
  {
    slug: "blok-kirici",
    title: "Blok Kırıcı",
    category: "arcade",
    tags: ["arcade", "reflex", "classic"],
    premium: false,
    cover: "c6",
    emoji: "🧱",
    plays: 19700,
    minAge: 5,
    entry: "/games/blok-kirici/index.html",
    short: {
      tr: "Topu sektir, tüm blokları kır. Klasik breakout.",
      en: "Bounce the ball, break all the bricks. Classic breakout.",
      es: "Rebota la bola y rompe todos los ladrillos. Breakout clásico.",
      zh: "弹起小球，击碎所有砖块。经典打砖块。",
    },
    about: {
      tr: "Blok Kırıcı, çubuğu hareket ettirip topu sektirerek tüm blokları kırmaya çalıştığın klasik arcade oyunudur. Fare, dokunmatik veya ok tuşlarıyla oyna. Reflekslerini test et!",
      en: "Breakout is the classic arcade game where you move the paddle to bounce the ball and smash every brick. Play with mouse, touch or arrow keys. Test your reflexes!",
      es: "Breakout es el clásico arcade en el que mueves la pala para rebotar la bola y romper cada ladrillo. Juega con ratón, táctil o flechas. ¡Pon a prueba tus reflejos!",
      zh: "打砖块是经典街机游戏，移动挡板弹起小球击碎所有砖块。可用鼠标、触屏或方向键操作。考验你的反应！",
    },
  },
  {
    slug: "refleks",
    title: "Refleks Testi",
    category: "reflex",
    tags: ["reflex", "reaction", "solo"],
    premium: false,
    cover: "c2",
    emoji: "⚡",
    plays: 12300,
    minAge: 6,
    entry: "/games/refleks/index.html",
    short: {
      tr: "Yeşil olunca dokun — refleksin kaç ms?",
      en: "Tap when it turns green — how fast are your reflexes?",
      es: "Toca cuando se ponga verde — ¿qué tan rápidos son tus reflejos?",
      zh: "变绿就点 —— 你的反应有多快？",
    },
    about: {
      tr: "Refleks Testi, ekran yeşile döndüğü an dokunarak tepki süreni ölçtüğün basit bir oyundur. Ne kadar hızlıysan skorun o kadar yüksek. Arkadaşlarınla yarış!",
      en: "Reaction Test is a simple game where you tap the moment the screen turns green to measure your reaction time. The faster you are, the higher your score. Race your friends!",
      es: "El test de reacción es un juego simple en el que tocas en cuanto la pantalla se pone verde para medir tu tiempo de reacción. Cuanto más rápido, mayor puntuación.",
      zh: "反应测试是一款简单的游戏，屏幕变绿的瞬间点击以测量你的反应时间。越快得分越高。和朋友一较高下！",
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
