import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LOCALES, SITE_NAME, SITE_URL } from "@/lib/site";
import { KOHESAP_APP_URL, KOHESAP_EXE_URL, KOHESAP_EXE_VERSION } from "@/lib/kohesap";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "kohesap" });
  return {
    title: t("title"),
    description: t("desc"),
    alternates: {
      canonical: `${SITE_URL}/${locale}/kohesap`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}/kohesap`])),
    },
    openGraph: {
      title: `${t("title")} · ${SITE_NAME}`,
      description: t("desc"),
      url: `${SITE_URL}/${locale}/kohesap`,
      images: [{ url: `${SITE_URL}/kohesap-app/preview.png`, width: 1440, height: 900 }],
    },
  };
}

const FEATS = [
  { k: "1", icon: "📒" },
  { k: "2", icon: "⚖️" },
  { k: "3", icon: "⚔️" },
  { k: "4", icon: "🪙" },
  { k: "5", icon: "🧮" },
  { k: "6", icon: "🛡️" },
] as const;

export default async function KoHesapPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("kohesap");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "KO Hesap",
    applicationCategory: "GameApplication",
    operatingSystem: "Windows 10, Windows 11, Web",
    softwareVersion: KOHESAP_EXE_VERSION,
    description: t("desc"),
    url: `${SITE_URL}/${locale}/kohesap`,
    downloadUrl: `${SITE_URL}${KOHESAP_EXE_URL}`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "TRY" },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };

  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="wrap">
        <nav className="breadcrumb" aria-label="breadcrumb">
          <Link href="/">{SITE_NAME}</Link>
          <span>/</span>
          <span>KO Hesap</span>
        </nav>

        <section className="ko-hero">
          <div>
            <span className="ko-eyebrow">{t("eyebrow")}</span>
            <h1>
              {t("h1")} <span className="g">— {t("h1g")}</span>
            </h1>
            <p className="ko-lead">{t("lead")}</p>
            <div className="ko-ctas">
              <a href={KOHESAP_APP_URL} className="btn btn-p ko-cta">
                🌐 {t("openWeb")}
              </a>
              <a href={KOHESAP_EXE_URL} className="btn btn-g ko-cta" download>
                ⬇ {t("download")}
              </a>
            </div>
            <p className="ko-note">{t("downloadNote", { version: KOHESAP_EXE_VERSION })}</p>
            <p className="ko-note">{t("smartscreen")}</p>
          </div>
          <a href={KOHESAP_APP_URL} className="ko-shot" aria-label={t("openWeb")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kohesap-app/preview.png" alt="KO Hesap" width={1440} height={900} loading="eager" />
          </a>
        </section>

        <section className="about-sec">
          <h2>{t("featTitle")}</h2>
          <div className="ko-feats">
            {FEATS.map((f) => (
              <div className="ko-feat" key={f.k}>
                <span className="ko-ic" aria-hidden="true">{f.icon}</span>
                <h3>{t(`f${f.k}t`)}</h3>
                <p>{t(`f${f.k}`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="about-sec ko-sync">
          <h2>{t("syncTitle")}</h2>
          <p>{t("syncBody")}</p>
          <div className="ko-ctas">
            <a href={KOHESAP_APP_URL} className="btn btn-p ko-cta">🌐 {t("openWeb")}</a>
            <a href={KOHESAP_EXE_URL} className="btn btn-g ko-cta" download>⬇ {t("download")}</a>
          </div>
        </section>
      </div>
    </>
  );
}
