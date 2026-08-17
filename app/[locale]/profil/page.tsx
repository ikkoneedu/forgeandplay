import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import ProfileView from "@/components/profile/ProfileView";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <ProfileView />
    </>
  );
}
