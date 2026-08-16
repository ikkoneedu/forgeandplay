import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LOCALES, SITE_NAME, SITE_URL } from "@/lib/site";
import { getTournaments } from "@/lib/tournaments";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tournaments" });
  const title = t("title");
  const description = t("desc");
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/${locale}/turnuvalar`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}/turnuvalar`])),
    },
    openGraph: { title: `${title} · ${SITE_NAME}`, description, url: `${SITE_URL}/${locale}/turnuvalar` },
  };
}

export default async function TournamentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tournaments");
  const tours = getTournaments();

  const jsonLd = tours.map((tr) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: tr.name,
    startDate: tr.date,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    eventStatus: "https://schema.org/EventScheduled",
    location: {
      "@type": "VirtualLocation",
      url: `${SITE_URL}/${locale}/turnuvalar`,
    },
    organizer: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  }));

  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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
            🏆 <span className="g">{t("title")}</span>
          </h1>
          <p>{t("desc")}</p>
        </header>

        <div className="sec-h" style={{ marginTop: 30, marginBottom: 16 }}>
          <h2 style={{ fontSize: 22 }}>{t("upcoming")}</h2>
        </div>
        <div className="tours">
          {tours.map((tr) => (
            <div key={tr.slug} className="tour">
              <div className={`thead ${tr.cover}`}>
                {tr.premium && <span className="tag-prem">👑 {t("premium")}</span>}
                <span className="temoji" aria-hidden="true">{tr.emoji}</span>
              </div>
              <div className="tbody">
                <h3>{tr.name}</h3>
                <div className="tmeta">{tr.game} · {tr.mode}</div>
                <div className="trow">
                  <span>{t("prize")}</span>
                  <span className="prize">{tr.prize}</span>
                </div>
                <div className="trow">
                  <span>{t("date")}</span>
                  <span>{dateFmt.format(new Date(tr.date))}</span>
                </div>
                <div className="trow">
                  <span>{t("slots", { filled: tr.filled, total: tr.slots })}</span>
                  <span>{tr.premium ? `👑 ${t("premium")}` : t("free")}</span>
                </div>
                <Link href="/giris" className="btn btn-p">{t("join")}</Link>
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: 60 }} />
      </div>
    </>
  );
}
