import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getAllLfgGames } from "@/lib/lfg";
import { LOCALES, SITE_NAME, SITE_URL } from "@/lib/site";
import LfgGameCard from "@/components/lfg/LfgGameCard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "lfg" });
  const title = t("index.title");
  const description = t("index.desc");
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/lfg`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}/lfg`])),
    },
    openGraph: {
      title: `${title} · ${SITE_NAME}`,
      description,
      url: `${SITE_URL}/${locale}/lfg`,
    },
  };
}

export default async function LfgIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("lfg");
  const games = getAllLfgGames();

  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <div className="aurora a2" aria-hidden="true" />
      <div className="wrap">
        <nav className="breadcrumb" aria-label="breadcrumb">
          <Link href="/">Forge&amp;Play</Link>
          <span>/</span>
          <span>{t("index.title")}</span>
        </nav>

        <header className="page-head">
          <h1>
            👥 <span className="g">{t("index.title")}</span>
          </h1>
          <p>{t("index.desc")}</p>
        </header>

        <div className="how">
          <div className="step"><div className="n">1</div><p>{t("index.how.s1")}</p></div>
          <div className="step"><div className="n">2</div><p>{t("index.how.s2")}</p></div>
          <div className="step"><div className="n">3</div><p>{t("index.how.s3")}</p></div>
        </div>

        <div className="sec-h" style={{ marginTop: 34, marginBottom: 18 }}>
          <h2 style={{ fontSize: 22 }}>{t("index.pick")}</h2>
        </div>
        <div className="games-grid">
          {games.map((g) => (
            <LfgGameCard key={g.slug} game={g} />
          ))}
        </div>
        <div style={{ height: 60 }} />
      </div>
    </>
  );
}
