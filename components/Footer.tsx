import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function Footer() {
  const tNav = useTranslations("nav");
  const tF = useTranslations("footer");
  const tProfile = useTranslations("profile");

  return (
    <footer className="site-footer">
      <div className="footer-in">
        <div className="footer-brand">
          <div className="logo">
            <span className="mk" aria-hidden="true">🔥</span>
            Forge<b>&amp;</b>Play
          </div>
          <p>{tF("tagline")}</p>
          <div className="footer-trust">
            <span>🔒 {tF("secure")}</span>
            <span>✓ {tF("verified")}</span>
          </div>
        </div>

        <div className="footer-col">
          <h4>{tF("discover")}</h4>
          <Link href="/oyunlar">{tNav("games")}</Link>
          <Link href="/lfg">{tNav("lfg")}</Link>
          <Link href="/turnuvalar">{tNav("tournaments")}</Link>
          <Link href="/siralama">{tNav("leaderboard")}</Link>
          <Link href="/topluluk">{tNav("community")}</Link>
        </div>

        <div className="footer-col">
          <h4>{tF("platform")}</h4>
          <Link href="/premium">{tNav("premium")}</Link>
          <Link href="/giris">{tNav("login")}</Link>
          <Link href="/profil">{tProfile("title")}</Link>
        </div>

        <div className="footer-col">
          <h4>{tF("legal")}</h4>
          <Link href="/gizlilik">{tF("privacy")}</Link>
          <Link href="/kullanim-sartlari">{tF("terms")}</Link>
          <Link href="/iletisim">{tF("contact")}</Link>
        </div>
      </div>

      <div className="footer-bottom">
        <span>{tF("rights")}</span>
        <span>forgeandplay.com</span>
      </div>
    </footer>
  );
}
