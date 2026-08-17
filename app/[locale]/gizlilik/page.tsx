import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LOCALES, SITE_NAME, SITE_URL } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return {
    title: t("privacyTitle"),
    description: t("privacyBody").slice(0, 150),
    alternates: {
      canonical: `${SITE_URL}/${locale}/gizlilik`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}/gizlilik`])),
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <div className="wrap">
        <nav className="breadcrumb" aria-label="breadcrumb">
          <Link href="/">{SITE_NAME}</Link>
          <span>/</span>
          <span>{t("privacyTitle")}</span>
        </nav>
        <header className="page-head">
          <h1>{t("privacyTitle")}</h1>
        </header>
        <div className="about-sec">
          <p style={{ whiteSpace: "pre-line" }}>{t("privacyBody")}</p>
        </div>
      </div>
    </>
  );
}
