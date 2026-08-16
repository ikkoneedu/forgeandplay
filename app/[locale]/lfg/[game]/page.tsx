import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  demoRoomsFor,
  getAllLfgGames,
  getLfgGame,
} from "@/lib/lfg";
import { LOCALES, SITE_NAME, SITE_URL } from "@/lib/site";
import RoomsBoard from "@/components/lfg/RoomsBoard";
import LfgGameCard from "@/components/lfg/LfgGameCard";

export function generateStaticParams() {
  return getAllLfgGames().map((g) => ({ game: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; game: string }>;
}): Promise<Metadata> {
  const { locale, game: slug } = await params;
  const game = getLfgGame(slug);
  if (!game) return {};
  const t = await getTranslations({ locale, namespace: "lfg" });
  const title = t("hub.h1", { game: game.name });
  const description = t("hub.intro", { game: game.name });
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/lfg/${slug}`,
      languages: Object.fromEntries(
        LOCALES.map((l) => [l, `${SITE_URL}/${l}/lfg/${slug}`])
      ),
    },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/${locale}/lfg/${slug}`,
    },
  };
}

export default async function LfgHub({
  params,
}: {
  params: Promise<{ locale: string; game: string }>;
}) {
  const { locale, game: slug } = await params;
  setRequestLocale(locale);
  const game = getLfgGame(slug);
  if (!game) notFound();
  const t = await getTranslations("lfg");
  const rooms = demoRoomsFor(game);

  const faqs = [
    { q: t("hub.q1", { game: game.name }), a: t("hub.a1", { game: game.name }) },
    { q: t("hub.q2", { game: game.name }), a: t("hub.a2", { game: game.name }) },
    { q: t("hub.q3", { game: game.name }), a: t("hub.a3", { game: game.name }) },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_URL}/${locale}` },
      { "@type": "ListItem", position: 2, name: t("index.title"), item: `${SITE_URL}/${locale}/lfg` },
      { "@type": "ListItem", position: 3, name: game.name, item: `${SITE_URL}/${locale}/lfg/${slug}` },
    ],
  };

  const related = getAllLfgGames().filter((g) => g.slug !== slug).slice(0, 4);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <div className="aurora a1" aria-hidden="true" />
      <div className="aurora a2" aria-hidden="true" />

      <div className="wrap">
        <nav className="breadcrumb" aria-label="breadcrumb">
          <Link href="/">Forge&amp;Play</Link>
          <span>/</span>
          <Link href="/lfg">{t("index.title")}</Link>
          <span>/</span>
          <span>{game.name}</span>
        </nav>

        <header className="page-head">
          <h1>
            {game.emoji} <span className="g">{t("hub.h1", { game: game.name })}</span>
          </h1>
          <p>{t("hub.intro", { game: game.name })}</p>
        </header>

        <RoomsBoard game={game} initialRooms={rooms} />

        <section className="about-sec" style={{ maxWidth: "100%" }}>
          <h2>{t("hub.faqTitle")}</h2>
          <div className="faq">
            {faqs.map((f, i) => (
              <div key={i} className="faq-item">
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="sec">
          <div className="sec-h">
            <h2 style={{ fontSize: 22 }}>{t("hub.related")}</h2>
          </div>
          <div className="games-grid">
            {related.map((g) => (
              <LfgGameCard key={g.slug} game={g} />
            ))}
          </div>
          <div style={{ height: 60 }} />
        </section>
      </div>
    </>
  );
}
