"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Icon, type IconName } from "@/components/icons";
import ThemeToggle from "@/components/ThemeToggle";
import ExchangeRateFab from "@/components/ExchangeRateFab";
import PageTransition from "@/components/PageTransition";
import TableEnhancer from "@/components/TableEnhancer";
import { t, isRtl, type Lang } from "@/lib/i18n";
import type { SessionUser } from "@/lib/auth";

interface AlertItem {
  id: string;
  type: string;
  severity: string;
  message: string;
  linkTo?: string | null;
}

const NAV: { key: string; href: string; icon: IconName; i18nKey: string }[] = [
  { key: "dashboard", href: "/", icon: "grid", i18nKey: "navDashboard" },
  { key: "customers", href: "/customers", icon: "users", i18nKey: "navCustomers" },
  { key: "beneficiaries", href: "/beneficiaries", icon: "handshake", i18nKey: "navBeneficiaries" },
  { key: "inventory", href: "/inventory", icon: "box", i18nKey: "navInventory" },
  { key: "pos", href: "/pos", icon: "receipt", i18nKey: "navPos" },
  { key: "invoices", href: "/invoices", icon: "file", i18nKey: "navInvoices" },
  { key: "vault", href: "/vault", icon: "shield", i18nKey: "navVault" },
  { key: "reports", href: "/reports", icon: "chart", i18nKey: "navReports" },
  { key: "settings", href: "/settings", icon: "settings", i18nKey: "navSettings" },
];

/** The 5 tabs shown in the mobile bottom bar; the rest live in the drawer. */
const MOBILE_TABS = ["dashboard", "customers", "pos", "vault", "more"] as const;

export default function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [lang, setLang] = useState<Lang>("en");
  // False until the saved language has been read from localStorage. The
  // persist effect below must not run before that, or it writes "en" over
  // the user's saved "ku" (and PATCHes the server with "en") on every page
  // load — which is exactly the "language keeps resetting to English" bug.
  const [hydrated, setHydrated] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  const allowed = NAV.filter((n) => user.permissions?.[n.key]);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  useEffect(() => {
    const saved = localStorage.getItem("alu_lang") as "en" | "ku" | null;
    if (saved) setLang(saved);
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Skip the very first run if the saved language hasn't been applied yet.
    if (!hydrated) return;
    const dir = isRtl(lang) ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = lang === "ku" ? "ckb" : "en";
    localStorage.setItem("alu_lang", lang);
    // Tell every mounted component (via useLang) to re-render with new strings.
    window.dispatchEvent(new CustomEvent<Lang>("alu-lang-change", { detail: lang }));
    fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {});
  }, [lang, hydrated]);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("/api/alerts");
        if (!res.ok) return;
        const data = await res.json();
        if (alive) {
          setAlerts(data.alerts || []);
          setUnread(data.unread || 0);
        }
      } catch {
        /* background refresh */
      }
    }
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pathname]);

  // Close overlays on navigation
  useEffect(() => {
    setDrawerOpen(false);
    setAlertsOpen(false);
  }, [pathname]);

  function toggleLang() {
    setLang((l) => (l === "en" ? "ku" : "en"));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }

  const moreActive = !MOBILE_TABS.slice(0, 4).some((k) => {
    const n = NAV.find((x) => x.key === k);
    return n && isActive(n.href);
  });

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-5">
        <Logo size={34} />
        <div className="min-w-0 flex-1">
          <p className="font-bold tracking-[0.08em] text-[13.5px] leading-tight text-white">ALU FACTORY</p>
          <p className="text-[10.5px] text-white/55 leading-tight mt-0.5">{t("tagline", lang)}</p>
        </div>
        {/* Alerts were only reachable on mobile; desktop users need the same signal. */}
        <button
          onClick={() => setAlertsOpen((v) => !v)}
          className="relative w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          aria-label={`${t("alerts", lang)}${unread ? ` (${unread})` : ""}`}
          title={t("alerts", lang)}
        >
          <Icon name="bell" size={17} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-[#D93025] text-white text-[9.5px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 border-2 border-[#10233d]">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {allowed.map((n) => (
          <Link key={n.key} href={n.href} className={`nav-item ${isActive(n.href) ? "active" : ""}`}>
            <Icon name={n.icon} size={17} />
            <span>{t(n.i18nKey, lang)}</span>
          </Link>
        ))}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-[12px] font-bold text-white/90 shrink-0">
            {user.fullName.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-white truncate leading-tight">{user.fullName}</p>
            <p className="text-[11px] text-white/55 truncate">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleLang}
            className="flex-1 h-8 rounded-lg text-[11.5px] font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            EN / کوردی
          </button>
          <ThemeToggle
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          />
          <button
            onClick={logout}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Sign out"
          >
            <Icon name="logout" size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div dir={lang === "ku" ? "rtl" : "ltr"}>
      {/* ===== Desktop sidebar ===== */}
      <aside className="sidebar no-print">{sidebar}</aside>

      {/* ===== Mobile top bar ===== */}
      <header className="mobile-bar no-print">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="font-bold tracking-[0.08em] text-[13px]">ALU FACTORY</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleLang}
            className="h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-white/70 hover:text-white hover:bg-white/10"
          >
            EN / کوردی
          </button>
          <ThemeToggle
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/10"
          />
          <button
            onClick={() => setAlertsOpen((v) => !v)}
            className="relative w-9 h-9 rounded-lg flex items-center justify-center text-white/80 hover:bg-white/10"
            aria-label={`Alerts${unread ? ` (${unread} unread)` : ""}`}
          >
            <Icon name="bell" size={18} />
            {unread > 0 && (
              <span className="absolute top-1 right-1 bg-[#D93025] text-white text-[9.5px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1 border-2 border-[#0d1b30]">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ===== Main ===== */}
      <main className="main-content">
        <div className="page">
          <PageTransition>{children}</PageTransition>
        </div>
      </main>

      {/* ===== Mobile bottom tabs ===== */}
      <nav className="mobile-tabs no-print" aria-label="Primary">
        {MOBILE_TABS.map((k) => {
          if (k === "more") {
            return (
              <button
                key={k}
                onClick={() => setDrawerOpen(true)}
                className={`mtab ${moreActive ? "active" : ""}`}
              >
                <Icon name="menu" size={20} />
                <span>{t("more", lang)}</span>
              </button>
            );
          }
          const n = NAV.find((x) => x.key === k)!;
          const active = isActive(n.href);
          return (
            <Link key={k} href={n.href} className={`mtab ${active ? "active" : ""}`}>
              <Icon name={n.icon} size={20} />
              <span>{t(n.key === "pos" ? "navPosShort" : n.i18nKey, lang)}</span>
            </Link>
          );
        })}
      </nav>

      {/* ===== Mobile drawer (all pages + logout) ===== */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 no-print" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/45" />
          <div
            className="absolute top-0 bottom-0 w-[264px] shadow-2xl"
            style={{
              background: "linear-gradient(180deg, #10233d 0%, #0d1b30 100%)",
              [lang === "ku" ? "right" : "left"]: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-6 pb-4">
              <div className="flex items-center gap-2.5">
                <Logo size={30} />
                <span className="font-bold tracking-[0.08em] text-[12.5px] text-white">ALU FACTORY</span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
                aria-label="Close menu"
              >
                <Icon name="x" size={17} />
              </button>
            </div>
            <nav className="px-3 space-y-1 overflow-y-auto">
              {allowed.map((n) => (
                <Link key={n.key} href={n.href} className={`mobile-drawer-link ${isActive(n.href) ? "active" : ""}`}>
                  <Icon name={n.icon} size={17} />
                  {t(n.i18nKey, lang)}
                </Link>
              ))}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-[12px] font-bold text-white/90">
                  {user.fullName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate">{user.fullName}</p>
                  <p className="text-[11px] text-white/45 truncate">{user.email}</p>
                </div>
              </div>
              <button onClick={logout} className="mobile-drawer-link w-full text-[#ff9d94]">
                <Icon name="logout" size={16} />
                {t("signOut", lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Floating exchange-rate CTA (every page) ===== */}
      <ExchangeRateFab />
      <TableEnhancer />

      {/* ===== Alerts popover ===== */}
      {alertsOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAlertsOpen(false)} />
          <div
            className="fixed z-50 top-14 right-3 left-3 sm:left-auto sm:w-[380px] md:top-4 md:right-auto md:left-[calc(var(--sidebar-w)+12px)] card p-2 no-print"
            style={{ boxShadow: "var(--shadow-pop)" }}
            role="dialog"
            aria-label="Alerts"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <p className="section-title text-[13.5px]">{t("alerts", lang)}</p>
              {alerts.length > 0 && (
                <button
                  onClick={async () => {
                    await fetch("/api/alerts", { method: "PATCH" });
                    setUnread(0);
                    setAlerts([]);
                  }}
                  className="text-[12px] font-semibold text-[#1B5DB1] hover:underline"
                >
                  {t("markAllRead", lang)}
                </button>
              )}
            </div>
            <div className="max-h-[320px] overflow-y-auto space-y-1">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center py-8 px-4 text-center">
                  <span className="w-9 h-9 rounded-full bg-[#E9F6EE] text-[#1E8A44] flex items-center justify-center mb-2">
                    <Icon name="check" size={16} />
                  </span>
                  <p className="text-[13px] text-muted">{t("noAlerts", lang)}</p>
                </div>
              ) : (
                alerts.map((a) => (
                  <button
                    key={a.id}
                    onClick={async () => {
                      await fetch(`/api/alerts/${a.id}`, { method: "PATCH" });
                      setAlertsOpen(false);
                      if (a.linkTo) window.location.href = a.linkTo;
                    }}
                    className={`w-full text-left flex items-start gap-2.5 p-3 rounded-[10px] text-[13px] leading-snug transition-colors ${
                      a.severity === "danger"
                        ? "bg-[#fcebe9] text-[#b82318] hover:bg-[#f9dcd8]"
                        : a.severity === "warning"
                        ? "bg-[#fdf3e3] text-[#8a4708] hover:bg-[#f9e8cd]"
                        : "bg-[#f2f4f7] text-[#101828] hover:bg-[#e9edf3]"
                    }`}
                  >
                    <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
                    <span>{a.message}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
