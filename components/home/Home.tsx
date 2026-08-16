"use client";

import { useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function Home() {
  const t = useTranslations("home");
  const tNav = useTranslations("nav");
  const tFooter = useTranslations("footer");
  const tPortal = useTranslations("portal");
  const locale = useLocale();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const pctRef = useRef<HTMLDivElement | null>(null);
  const statsRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ---- starfield ----
    const cv = canvasRef.current;
    let raf = 0;
    if (cv && !reduce) {
      const cx = cv.getContext("2d");
      let W = 0;
      let H = 0;
      let ps: { x: number; y: number; z: number; s: number }[] = [];
      const rs = () => {
        W = cv.width = window.innerWidth;
        H = cv.height = window.innerHeight;
        ps = Array.from({ length: 90 }, () => ({
          x: Math.random() * W,
          y: Math.random() * H,
          z: Math.random() * 0.8 + 0.2,
          s: Math.random() * 1.4 + 0.3,
        }));
      };
      rs();
      window.addEventListener("resize", rs);
      const draw = () => {
        if (!cx) return;
        cx.clearRect(0, 0, W, H);
        for (const p of ps) {
          p.y += p.z * 0.25;
          if (p.y > H) p.y = 0;
          cx.globalAlpha = p.z;
          cx.fillStyle = p.z > 0.7 ? "#A78BFA" : "#5566aa";
          cx.beginPath();
          cx.arc(p.x, p.y, p.s, 0, 7);
          cx.fill();
        }
        raf = requestAnimationFrame(draw);
      };
      draw();
    }

    // ---- count up ----
    const nf = new Intl.NumberFormat(locale);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          const target = Number(el.dataset.c || "0");
          const suf = el.dataset.suf || "";
          if (reduce) {
            el.textContent = nf.format(target) + suf;
            io.unobserve(el);
            return;
          }
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / 1400, 1);
            const n = Math.floor((1 - Math.pow(1 - p, 3)) * target);
            el.textContent = nf.format(n) + (p === 1 ? suf : "");
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          io.unobserve(el);
        });
      },
      { threshold: 0.6 }
    );
    statsRef.current
      ?.querySelectorAll<HTMLElement>("[data-c]")
      .forEach((el) => io.observe(el));

    // ---- match % pulse ----
    let pctTimer: ReturnType<typeof setInterval> | undefined;
    const pe = pctRef.current;
    if (pe && !reduce) {
      let pv = 60;
      pctTimer = setInterval(() => {
        const target = 88 + Math.floor(Math.random() * 10);
        const start = performance.now();
        const from = pv;
        const anim = (now: number) => {
          const p = Math.min((now - start) / 700, 1);
          pe.textContent = Math.floor(from + (target - from) * p) + "%";
          if (p < 1) requestAnimationFrame(anim);
          else pv = target;
        };
        requestAnimationFrame(anim);
      }, 3200);
    }

    // ---- 3D tilt ----
    const cleanups: (() => void)[] = [];
    const addTilt = (el: HTMLElement, max: number) => {
      if (reduce) return;
      const move = (ev: MouseEvent) => {
        const r = el.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width - 0.5;
        const y = (ev.clientY - r.top) / r.height - 0.5;
        el.style.transform = `rotateY(${x * max}deg) rotateX(${-y * max}deg) translateY(-4px)`;
      };
      const leave = () => {
        el.style.transform = "";
      };
      el.addEventListener("mousemove", move);
      el.addEventListener("mouseleave", leave);
      cleanups.push(() => {
        el.removeEventListener("mousemove", move);
        el.removeEventListener("mouseleave", leave);
      });
    };
    if (tiltRef.current) addTilt(tiltRef.current, 12);
    gridRef.current
      ?.querySelectorAll<HTMLElement>(".gcard")
      .forEach((c) => addTilt(c, 9));

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      if (pctTimer) clearInterval(pctTimer);
      cleanups.forEach((fn) => fn());
    };
  }, [locale]);

  return (
    <>
      <canvas id="stars" ref={canvasRef} aria-hidden="true" />
      <div className="aurora a1" aria-hidden="true" />
      <div className="aurora a2" aria-hidden="true" />
      <div className="aurora a3" aria-hidden="true" />

      <nav className="fp-nav">
        <div className="nav-in">
          <div className="logo">
            <span className="mk" aria-hidden="true">
              🔥
            </span>
            Forge<b>&amp;</b>Play
          </div>
          <div className="nmenu">
            <Link href="/oyunlar">{tNav("games")}</Link>
            <Link href="/lfg">{tNav("lfg")}</Link>
            <a href="#">{tNav("tournaments")}</a>
            <a href="#">{tNav("store")}</a>
            <a href="#" className="prem">
              👑 {tNav("premium")}
            </a>
          </div>
          <div className="nright">
            <span className="chip">
              <span className="live" aria-hidden="true" />
              {tNav("online", { count: 412 })}
            </span>
            <button className="btn btn-p" style={{ padding: "10px 18px", fontSize: 13.5 }}>
              {tNav("login")}
            </button>
          </div>
        </div>
      </nav>

      <div className="wrap">
        {/* HERO */}
        <section className="hero">
          <div>
            <span className="eyebrow">✦ {t("eyebrow")}</span>
            <h1>
              {t("titleLine1")} <span className="g">{t("titleAccent")}</span>
              <br />
              {t("titleLine2")}
            </h1>
            <p className="lead">{t("lead")}</p>
            <div className="cta">
              <Link href="/lfg" className="btn btn-p" style={{ padding: "16px 28px" }}>
                ⚡ {t("ctaPrimary")}
              </Link>
              <Link
                href="/oyunlar"
                className="btn btn-g"
                style={{ padding: "16px 26px" }}
              >
                ▶ {t("ctaSecondary")}
              </Link>
            </div>
            <div className="platforms">
              <span className="pl">🎮 Steam</span>
              <span className="pl">🕹 Epic</span>
              <span className="pl">🎯 Riot</span>
              <span className="pl">Ⓧ Xbox</span>
              <span className="pl">▶ PS5</span>
              <span className="pl">💻 PC</span>
            </div>
            <div className="stats" ref={statsRef}>
              <div className="stat">
                <b data-c="1276">0</b>
                <small>{t("stats.today")}</small>
              </div>
              <div className="stat">
                <b data-c="18969">0</b>
                <small>{t("stats.teams")}</small>
              </div>
              <div className="stat">
                <b data-c="412">0</b>
                <small>{t("stats.active")}</small>
              </div>
              <div className="stat">
                <b data-c="4822" data-suf="+">
                  0
                </b>
                <small>{t("stats.members")}</small>
              </div>
            </div>
          </div>

          {/* AI money card */}
          <div className="stage">
            <div className="ai-card" ref={tiltRef}>
              <div className="aic-top">
                <div className="t">
                  <div className="aic-ic" aria-hidden="true">
                    🧠
                  </div>
                  <div>
                    <h3>{t("ai.title")}</h3>
                    <small>{t("ai.subtitle")}</small>
                  </div>
                </div>
                <span className="prem-badge">👑 {t("ai.premium")}</span>
              </div>
              <div className="radar" aria-hidden="true">
                <div className="grid" />
                <div className="sweep" />
                <div className="blip b1" />
                <div className="blip b2" />
                <div className="blip b3" />
                <div className="match-c">
                  <div className="pct" ref={pctRef}>
                    94%
                  </div>
                  <small>{t("ai.match")}</small>
                </div>
              </div>
              <div className="tm t1">
                <div className="av a-o">M</div>
                <div>
                  <div className="nm">MrClutch_TR</div>
                  <div className="rk">CS2 · Silver Elite · 🎙</div>
                </div>
                <div className="fit">%96</div>
              </div>
              <div className="tm t2">
                <div className="av a-v">Z</div>
                <div>
                  <div className="nm">zephyr.exe</div>
                  <div className="rk">Valorant · Gold · 🇹🇷</div>
                </div>
                <div className="fit">%92</div>
              </div>
              <div className="tm t3">
                <div className="av a-c">A</div>
                <div>
                  <div className="nm">AcePilot</div>
                  <div className="rk">Rocket League · Diamond</div>
                </div>
                <div className="fit">%89</div>
              </div>
              <Link href="/lfg" className="btn btn-p aic-btn">
                {t("ai.cta")} →
              </Link>
            </div>
          </div>
        </section>

        {/* GAMES */}
        <section className="sec">
          <div className="sec-h">
            <div>
              <h2>🔥 {t("games.title")}</h2>
              <p>{t("games.subtitle")}</p>
            </div>
            <Link href="/oyunlar">{t("games.all")} →</Link>
          </div>
          <div className="grid3" ref={gridRef}>
            <Link href="/oyna/2048" className="gcard" style={{ display: "block" }}>
              <div className="cov c1">
                <span className="tag t-orange">#1 TREND</span>
                <span className="cover-emoji" aria-hidden="true">
                  🔢
                </span>
                <h4>2048</h4>
              </div>
              <div className="m">
                <span>{tPortal("cat.puzzle")}</span>
                <span className="pl">▶ {t("games.played", { count: "32K" })}</span>
              </div>
            </Link>
            <Link href="/oyna/yilan" className="gcard" style={{ display: "block" }}>
              <div className="cov c2">
                <span className="tag t-hot">🔥</span>
                <span className="cover-emoji" aria-hidden="true">
                  🐍
                </span>
                <h4>Yılan</h4>
              </div>
              <div className="m">
                <span>{tPortal("cat.arcade")}</span>
                <span className="pl">▶ {t("games.played", { count: "28K" })}</span>
              </div>
            </Link>
            <Link href="/oyna/hafiza" className="gcard" style={{ display: "block" }}>
              <div className="cov c4">
                <span className="cover-emoji" aria-hidden="true">
                  🧠
                </span>
                <h4>Hafıza Kartları</h4>
              </div>
              <div className="m">
                <span>{tPortal("cat.puzzle")}</span>
                <span className="pl">▶ {t("games.played", { count: "22K" })}</span>
              </div>
            </Link>
          </div>
        </section>

        {/* PREMIUM */}
        <section className="premium">
          <div className="in">
            <div>
              <h2>
                {t("premium.title")} <span>{t("premium.titleAccent")}</span>{" "}
                {t("premium.titleEnd")}
              </h2>
              <p>{t("premium.desc")}</p>
              <div className="plist">
                <span>⚡ {t("premium.features.ai")}</span>
                <span>🚫 {t("premium.features.noads")}</span>
                <span>👑 {t("premium.features.games")}</span>
                <span>🚀 {t("premium.features.boost")}</span>
                <span>✦ {t("premium.features.badge")}</span>
              </div>
            </div>
            <button className="btn btn-p">👑 {t("premium.cta")}</button>
          </div>
        </section>
      </div>

      <footer className="fp-footer">
        Forge&amp;Play · {tFooter("tagline")} · forgeandplay.com
      </footer>
    </>
  );
}
