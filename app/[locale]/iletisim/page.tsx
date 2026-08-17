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
    title: t("contactTitle"),
    description: t("contactBody"),
    alternates: {
      canonical: `${SITE_URL}/${locale}/iletisim`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}/iletisim`])),
    },
  };
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const email = t("email");
  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <div className="wrap">
        <nav className="breadcrumb" aria-label="breadcrumb">
          <Link href="/">{SITE_NAME}</Link>
          <span>/</span>
          <span>{t("contactTitle")}</span>
        </nav>
        <header className="page-head">
          <h1>{t("contactTitle")}</h1>
          <p>{t("contactBody")}</p>
        </header>
        <div className="about-sec">
          <a href={`mailto:${email}`} className="btn btn-p" style={{ padding: "13px 24px" }}>
            ✉ {email}
          </a>
        </div>
      </div>
    </>
  );
}
