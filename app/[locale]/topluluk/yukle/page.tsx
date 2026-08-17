import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import UploadForm from "@/components/community/UploadForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "community" });
  return {
    title: t("upload"),
    description: t("desc"),
    robots: { index: false, follow: true },
  };
}

export default async function UploadPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <UploadForm />
    </>
  );
}
