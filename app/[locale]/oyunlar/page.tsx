import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAllGames } from "@/lib/games";
import { LOCALES, SITE_NAME, SITE_URL } from "@/lib/site";
import GamesBrowser from "@/components/games/GamesBrowser";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal" });
  const title = t("games.title");
  const description = t("games.desc");
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/oyunlar`,
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `${SITE_URL}/${l}/oyunlar`])
      ),
    },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/${locale}/oyunlar`,
    },
  };
}

export default async function GamesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("portal");
  const games = getAllGames();

  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <div className="aurora a2" aria-hidden="true" />
      <div className="wrap">
        <nav className="breadcrumb" aria-label="breadcrumb">
          <Link href="/">{t("play.home")}</Link>
          <span>/</span>
          <span>{t("play.gamesCrumb")}</span>
        </nav>

        <header className="page-head">
          <h1>
            🔥 <span className="g">{t("games.title")}</span>
          </h1>
          <p>{t("games.desc")}</p>
        </header>

        <GamesBrowser games={games} />
        <div style={{ height: 60 }} />
      </div>
    </>
  );
}
