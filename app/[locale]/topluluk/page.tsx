import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LOCALES, SITE_NAME, SITE_URL } from "@/lib/site";
import CommunityGames from "@/components/community/CommunityGames";
import AdminUploadButton from "@/components/community/AdminUploadButton";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "community" });
  const title = t("title");
  const description = t("desc");
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/topluluk`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}/topluluk`])),
    },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url: `${SITE_URL}/${locale}/topluluk` },
  };
}

export default async function CommunityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("community");

  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <div className="aurora a2" aria-hidden="true" />
      <div className="wrap">
        <nav className="breadcrumb" aria-label="breadcrumb">
          <Link href="/">Forge&amp;Play</Link>
          <span>/</span>
          <span>{t("title")}</span>
        </nav>
        <header className="page-head">
          <h1>
            🌟 <span className="g">{t("title")}</span>
          </h1>
          <p>{t("desc")}</p>
          <div style={{ marginTop: 18 }}>
            <AdminUploadButton style={{ padding: "13px 24px" }} />
          </div>
        </header>

        <CommunityGames showHeader={false} />
        <div style={{ height: 60 }} />
      </div>
    </>
  );
}
