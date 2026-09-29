"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";
import SpecularButton from "@/components/SpecularButton";
import { Icon } from "@/components/icons";
import { toast } from "@/components/Toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<"en" | "ku">("en");
  const [showPw, setShowPw] = useState(false);

  const ku = lang === "ku";
  const t = (en: string, k: string) => (ku ? k : en);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, language: lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Login failed", "error");
        setBusy(false);
        return;
      }
      window.location.replace("/");
    } catch {
      toast(t("Connection lost. Check your internet and try again.", "پەیوەندی پچڕا."), "error");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex" dir={ku ? "rtl" : "ltr"}>
      {/* Brand panel (desktop) — the extrusion die: billet pushed through fine strands */}
      <div
        className="hidden lg:flex flex-col justify-between w-[46%] p-12 strands no-print"
        style={{
          background:
            "linear-gradient(160deg, rgba(15,32,56,0.82) 0%, rgba(18,63,123,0.78) 62%, rgba(27,93,177,0.72) 100%)",
          backdropFilter: "blur(18px) saturate(1.2)",
          WebkitBackdropFilter: "blur(18px) saturate(1.2)",
          borderRight: "1px solid rgba(255,255,255,0.14)",
        }}
      >
        <div className="flex items-center gap-3 rise">
          <Logo size={38} />
          <span className="font-bold tracking-[0.1em] text-white text-[15px]">ALU FACTORY</span>
        </div>
        <div>
          <h1 className="text-white text-[36px] font-bold leading-[1.12] tracking-[-0.022em] max-w-[430px] rise rise-1">
            {t("One kilogram wrong is money wrong.", "هەر کیلۆگرامێکی هەڵە پارەی هەڵەیە.")}
          </h1>
          <p className="text-white/60 text-[14.5px] leading-relaxed max-w-[420px] mt-4 rise rise-2">
            {t(
              "Every purchase, loss, and sale is weighed, priced, and reconciled here — to the kilogram and the cent.",
              "هەر کڕین، زیان و فرۆشتنێک بە وردی تۆمار دەکرێت."
            )}
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-10 max-w-[430px] rise rise-3">
            {[
              ["box", t("Live stock in kilograms", "کۆگا بە کیلۆگرام")],
              ["shield", t("USD and IQD vaults", "گەنجینەی USD و IQD")],
              ["receipt", t("Invoices as you sell", "پسوڵە لەگەڵ فرۆشتن")],
              ["chart", t("Profit without spreadsheets", "قازانج بەبێ ئێکسڵ")],
            ].map(([icon, label]) => (
              <div key={label} className="flex items-center gap-3 text-white/80 text-[13px] font-medium">
                <span className="w-8 h-8 rounded-[10px] bg-white/10 flex items-center justify-center shrink-0">
                  <Icon name={icon} size={15} />
                </span>
                {label}
              </div>
            ))}
          </div>
        </div>
        <p className="text-white/30 text-[11.5px] rise rise-3">© {new Date().getFullYear()} ALU FACTORY · Erbil</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-5 relative">
        <button
          onClick={() => setLang(ku ? "en" : "ku")}
          className="absolute top-5 right-5 btn btn-secondary btn-sm"
        >
          {ku ? "English" : "کوردی"}
        </button>

        <div className="w-full max-w-[380px] rounded-2xl p-7 sm:p-9 glass-panel">
          <div className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <Logo size={34} />
            <span className="font-bold tracking-[0.1em] text-[14px]">ALU FACTORY</span>
          </div>

          <h2 className="page-title mb-1 rise rise-1">{t("Welcome back", "بەخێربێیت")}</h2>
          <p className="page-sub mb-7 rise rise-1">
            {t("Sign in to manage factory operations", "بۆ بەڕێوەبردنی کارەکان چوونە ژوورەوە")}
          </p>

          <form onSubmit={submit} className="space-y-4 rise rise-2">
            <label className="block">
              <span className="lbl">{t("Email", "ئیمەیڵ")}</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="inp"
                placeholder="blbas11@gmail.com"
                autoComplete="email"
                autoFocus
              />
            </label>

            <label className="block">
              <span className="lbl">{t("Password", "وشەی نهێنی")}</span>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="inp pr-11"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-[var(--text)] p-1"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  <Icon name={showPw ? "eyeOff" : "eye"} size={15} />
                </button>
              </div>
            </label>

            <SpecularButton
              type="submit"
              className="w-full !h-[44px] !text-[14px]"
              disabled={busy}
              aria-busy={busy || undefined}
            >
              {busy ? t("Signing in…", "چاوەڕوان بە…") : t("Sign In", "چوونە ژوورەوە")}
            </SpecularButton>
          </form>

          <p className="mt-6 text-[12px] text-faint text-center leading-relaxed">
            {t(
              "Access is role-based. Your administrator controls which modules you can see.",
              "دەستگەیشتن بەپێی ڕۆڵ دیاریکراوە."
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
