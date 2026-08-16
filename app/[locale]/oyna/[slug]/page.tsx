import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  formatPlays,
  getAllGames,
  getGame,
  type Game,
} from "@/lib/games";
import type { Locale } from "@/i18n/routing";
import { LOCALES, SITE_NAME, SITE_URL } from "@/lib/site";
import GamePlayer from "@/components/games/GamePlayer";
import GameCard from "@/components/games/GameCard";

export function generateStaticParams() {
  return getAllGames().map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const game = getGame(slug);
  if (!game) return {};
  const loc = locale as Locale;
  const title = game.title;
  const description = game.short[loc];
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/oyna/${slug}`,
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `${SITE_URL}/${l}/oyna/${slug}`])
      ),
    },
    openGraph: {
      type: "article",
      title: `${title} · ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/${locale}/oyna/${slug}`,
    },
  };
}

function videoGameJsonLd(game: Game, locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    description: game.short[locale],
    url: `${SITE_URL}/${locale}/oyna/${game.slug}`,
    genre: game.category,
    gamePlatform: "Web Browser",
    applicationCategory: "Game",
    operatingSystem: "Any",
    inLanguage: locale,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}

function breadcrumbJsonLd(game: Game, locale: string, gamesLabel: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: SITE_NAME,
        item: `${SITE_URL}/${locale}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: gamesLabel,
        item: `${SITE_URL}/${locale}/oyunlar`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: game.title,
        item: `${SITE_URL}/${locale}/oyna/${game.slug}`,
      },
    ],
  };
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const game = getGame(slug);
  if (!game) notFound();
  const loc = locale as Locale;
  const t = await getTranslations("portal");

  const related = getAllGames()
    .filter((g) => g.slug !== game.slug && g.category === game.category)
    .slice(0, 3);
  const fallback = getAllGames()
    .filter((g) => g.slug !== game.slug)
    .slice(0, 3);
  const relatedGames = related.length ? related : fallback;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(videoGameJsonLd(game, loc)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd(game, locale, t("play.gamesCrumb"))
          ),
        }}
      />
      <div className="aurora a1" aria-hidden="true" />
      <div className="aurora a2" aria-hidden="true" />

      <div className="wrap">
        <nav className="breadcrumb" aria-label="breadcrumb">
          <Link href="/">{t("play.home")}</Link>
          <span>/</span>
          <Link href="/oyunlar">{t("play.gamesCrumb")}</Link>
          <span>/</span>
          <span>{game.title}</span>
        </nav>

        <header className="page-head" style={{ paddingBottom: 4 }}>
          <h1>
            {game.emoji} {game.title}
          </h1>
          <p>{game.short[loc]}</p>
        </header>

        <GamePlayer slug={game.slug} entry={game.entry} title={game.title} />

        <section className="about-sec">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span className="chip">{t(`cat.${game.category}`)}</span>
            <span className="chip">▶ {t("play.plays", { count: formatPlays(game.plays) })}</span>
            {game.tags.map((tag) => (
              <span key={tag} className="chip">
                #{tag}
              </span>
            ))}
          </div>
          <h2>{t("play.about")}</h2>
          <p>{game.about[loc]}</p>
        </section>

        <section className="sec">
          <div className="sec-h">
            <h2>{t("play.related")}</h2>
            <Link href="/oyunlar">{t("games.playNow")} →</Link>
          </div>
          <div className="games-grid">
            {relatedGames.map((g) => (
              <GameCard key={g.slug} game={g} />
            ))}
          </div>
          <div style={{ height: 60 }} />
        </section>
      </div>
    </>
  );
}
