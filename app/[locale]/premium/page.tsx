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
  const t = await getTranslations({ locale, namespace: "premium" });
  const title = t("title");
  const description = t("desc");
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/premium`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}/premium`])),
    },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url: `${SITE_URL}/${locale}/premium` },
  };
}

export default async function PremiumPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("premium");

  const tiers = [
    { key: "free", feats: ["f1", "f2", "f3", "f4"], pop: false, cta: t("ctaFree"), variant: "btn-g" },
    { key: "pro", feats: ["f1", "f2", "f3", "f4", "f5"], pop: true, cta: t("cta"), variant: "btn-p" },
    { key: "elite", feats: ["f1", "f2", "f3", "f4", "f5"], pop: false, cta: t("cta"), variant: "btn-g" },
  ] as const;

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
        <header className="page-head" style={{ textAlign: "center" }}>
          <h1>
            👑 <span className="g">{t("title")}</span>
          </h1>
          <p style={{ margin: "0 auto" }}>{t("desc")}</p>
        </header>

        <div className="pricing">
          {tiers.map((tier) => (
            <div key={tier.key} className={`tier ${tier.pop ? "pop" : ""}`}>
              {tier.pop && <span className="badge-pop">{t("popular")}</span>}
              <h3>{t(`tiers.${tier.key}.name`)}</h3>
              <div className="price">
                {t(`tiers.${tier.key}.price`)}
                {tier.key !== "free" && <span>{t("perMonth")}</span>}
              </div>
              <p className="tdesc">{t(`tiers.${tier.key}.desc`)}</p>
              <ul>
                {tier.feats.map((f) => (
                  <li key={f}>{t(`tiers.${tier.key}.${f}`)}</li>
                ))}
              </ul>
              <Link href="/giris" className={`btn ${tier.variant}`}>
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
