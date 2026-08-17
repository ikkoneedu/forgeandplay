"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { isAdmin } from "@/lib/admin";

export default function AdminUploadButton({ style }: { style?: React.CSSProperties }) {
  const t = useTranslations("community");
  const { user } = useAuth();
  if (!isAdmin(user)) return null;
  return (
    <Link
      href="/topluluk/yukle"
      className="btn btn-p"
      style={style ?? { padding: "10px 18px", fontSize: 14 }}
    >
      ＋ {t("upload")}
    </Link>
  );
}
