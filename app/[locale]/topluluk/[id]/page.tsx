import type { Metadata } from "next";
import UserGamePlayer from "@/components/community/UserGamePlayer";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function CommunityGamePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <div className="aurora a1" aria-hidden="true" />
      <UserGamePlayer id={id} />
    </>
  );
}
