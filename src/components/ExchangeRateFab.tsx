"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import { toast } from "@/components/Toast";
import { Icon } from "@/components/icons";
import { fmtMoney } from "@/lib/money";
import { t, type Lang } from "@/lib/i18n";

/* ==========================================================================
   Exchange-rate FAB
   --------------------------------------------------------------------------
   A floating action button, fixed in the bottom corner of EVERY page, with a
   continuously spinning "$" coin. Clicking it opens the exchange-rate module
   (the same PUT /api/settings flow the Vault page uses).

   The current rate is written onto `window.__aluRate` whenever it loads or is
   saved, so the Vault page's own "Edit rate" modal and this FAB stay in sync
   without any extra fetches on mount.
   ========================================================================== */

declare global {
  interface Window {
    __aluRate?: number;
    __aluRateEditable?: boolean;
    __aluLang?: Lang;
  }
}

/** Fire on every rate save so other views can refresh themselves. */
function emitRateChanged(rate: number) {
  window.dispatchEvent(new CustomEvent("alu-rate-change", { detail: rate }));
}

export default function ExchangeRateFab() {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [newRate, setNewRate] = useState("");
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<Lang>("en");

  // Permission: only owners/admins may CHANGE the rate; everyone else sees
  // the current figure read-only. The server enforces this on PUT too
  // (settings route rejects exchangeRate changes from non-owners), so a
  // hidden form would only produce an error toast — hide it instead.
  const [editable, setEditable] = useState(false);

  useEffect(() => {
    // Reuse the app's language so labels follow the EN/کوردی toggle.
    const savedLang = (localStorage.getItem("alu_lang") as Lang | null) ?? "en";
    setLang(savedLang);
    const onLang = (e: Event) => setLang((e as CustomEvent<Lang>).detail);
    window.addEventListener("alu-lang-change", onLang);

    async function load() {
      try {
        // The settings GET returns the rate only; owner-ness comes from the
        // session (the server still enforces it on PUT — this only decides
        // whether we show the form or a read-only note).
        const [res, me] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/auth/me").catch(() => null),
        ]);
        if (res.ok) {
          const d = await res.json();
          const r = Number(d.settings?.exchangeRate ?? 0);
          if (r > 0) {
            setRate(r);
            setNewRate(String(d.settings.exchangeRate));
            window.__aluRate = r;
          }
        }
        if (me && me.ok) {
          const u = await me.json();
          const owner = u?.user?.role === "OWNER" || u?.role === "OWNER";
          setEditable(owner);
          window.__aluRateEditable = owner;
        }
      } catch {
        /* non-fatal */
      }
    }
    load();

    // Follow live rate changes made elsewhere (e.g. the Vault modal).
    const onRate = (e: Event) => {
      const r = (e as CustomEvent<number>).detail;
      setRate(r);
      setNewRate(String(r));
    };
    window.addEventListener("alu-rate-change", onRate);
    return () => {
      window.removeEventListener("alu-lang-change", onLang);
      window.removeEventListener("alu-rate-change", onRate);
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exchangeRate: newRate }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast(d.error || t("rateSaveFailed", lang), "error");
        return;
      }
      const r = Number(newRate);
      setRate(r);
      window.__aluRate = r;
      toast(t("rateSaved", lang), "success");
      setOpen(false);
      emitRateChanged(r);
    } catch {
      toast(t("rateSaveFailed", lang), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Floating CTA — above every page, above the mobile tab bar (z-40). */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t("exchangeRate", lang)}
        title={rate != null ? `${t("exchangeRate", lang)}: 1 USD = ${fmtMoney(rate)} IQD` : t("exchangeRate", lang)}
        className="rate-fab no-print"
      >
        <span className="rate-fab-coin" aria-hidden="true">
          <Icon name="dollar" size={18} strokeWidth={2.4} />
        </span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("exchangeRate", lang)}>
        {/* Current rate banner */}
        <div className="rounded-xl px-4 py-3 mb-4 bg-[#E8F0FB] text-[#143F7A] flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-[0.6px] opacity-80">
            {t("currentRate", lang)}
          </span>
          <span className="text-[17px] font-extrabold tabular">
            {rate != null ? `1 USD = ${fmtMoney(rate)} IQD` : "—"}
          </span>
        </div>

        {editable ? (
          <form onSubmit={save} className="space-y-4">
            <label className="block">
              <span className="lbl">1 USD = ? IQD *</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                className="inp"
              />
            </label>
            <p className="text-xs text-[#6B7280]">
              {t("rateLoggedNote", lang)}
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
                {t("cancel", lang)}
              </button>
              <Button type="submit" busy={busy}>
                {t("saveRate", lang)}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-[13px] text-muted">{t("rateViewOnly", lang)}</p>
        )}
      </Modal>
    </>
  );
}
