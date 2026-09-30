"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Skeleton, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import ReportSheet, { rangeText, type SheetPayload } from "@/components/ReportSheet";
import { exportReportCsv, exportReportPdf, chooseReportDir, getReportDir, fsAccessSupported } from "@/lib/report-pdf";
import { toast } from "@/components/Toast";

/* ---------------- report catalogue ---------------- */

const REPORTS = [
  { id: "pnl", label: "Overall P&L Report", icon: "chart", blurb: "Profit and loss in USD equivalent" },
  { id: "sales", label: "Sales Report", icon: "receipt", blurb: "Every invoice in the range" },
  { id: "purchases", label: "Purchase Report", icon: "box", blurb: "Every purchase in the range" },
  { id: "customerAging", label: "Customer Due Aging", icon: "users", blurb: "Who still owes, by age" },
  { id: "beneficiaryAging", label: "Beneficiary Due Aging", icon: "handshake", blurb: "Who we still owe, by age" },
  { id: "inventoryMovement", label: "Inventory Movement", icon: "scale", blurb: "Stock in, out and processing loss" },
  { id: "vaultHistory", label: "Vault Balance History", icon: "wallet", blurb: "USD and IQD money movement" },
  { id: "bestCustomers", label: "Best Customers", icon: "TrendingUp", blurb: "Customers ranked by revenue" },
  { id: "bestBeneficiaries", label: "Best Beneficiaries", icon: "factory", blurb: "Suppliers ranked by spend" },
] as const;

const PAGE_SIZES = [50, 100, 200, 500];

/* ---------------- date helpers ---------------- */

const iso = (d: Date) => d.toISOString().slice(0, 10);

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

type PresetId = "30d" | "thisMonth" | "lastMonth" | "quarter" | "ytd" | "all" | "custom";

/** Each preset resolves to a concrete {from, to} pair. */
function resolvePreset(id: PresetId): { from: string; to: string } {
  const now = new Date();
  switch (id) {
    case "30d":
      return { from: iso(addDays(now, -29)), to: iso(now) };
    case "thisMonth":
      return { from: iso(startOfMonth(now)), to: iso(now) };
    case "lastMonth": {
      const first = startOfMonth(now);
      const prev = new Date(first.getFullYear(), first.getMonth() - 1, 1);
      const end = new Date(first.getFullYear(), first.getMonth(), 0);
      return { from: iso(prev), to: iso(end) };
    }
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return { from: iso(new Date(now.getFullYear(), q, 1)), to: iso(now) };
    }
    case "ytd":
      return { from: `${now.getFullYear()}-01-01`, to: iso(now) };
    case "all":
    default:
      return { from: "", to: "" };
  }
}

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "30d", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "quarter", label: "This quarter" },
  { id: "ytd", label: "Year to date" },
  { id: "all", label: "All time" },
];

/* ---------------- column preferences ---------------- */

const PREFS_KEY = "alu_report_columns";

type Prefs = Record<string, string[]>;

function loadPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode — the choice just won't persist */
  }
}

/* ---------------- page ---------------- */

export default function ReportsPage() {
  const [type, setType] = useState<string>("pnl");
  const [preset, setPreset] = useState<PresetId>("30d");
  const [from, setFrom] = useState(() => resolvePreset("30d").from);
  const [to, setTo] = useState(() => resolvePreset("30d").to);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(200);
  const [data, setData] = useState<SheetPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null);
  const [dirName, setDirName] = useState<string | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({});
  const colsRef = useRef<HTMLDivElement | null>(null);

  const active = REPORTS.find((r) => r.id === type) ?? REPORTS[0];

  /* ---- column selection (export only) ---- */
  const columns = data?.columns ?? [];
  const saved = prefs[type];
  const selected: string[] = useMemo(() => {
    if (!columns.length) return [];
    if (saved?.length) return columns.filter((c) => saved.includes(c.key)).map((c) => c.key);
    return columns.map((c) => c.key);
  }, [columns, saved]);

  const visibleKeys = selected.length > 0 ? selected : columns.map((c) => c.key);

  function toggleColumn(key: string) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    const ordered = columns.map((c) => c.key).filter((k) => next.includes(k));
    setPrefs((p) => {
      const np = { ...p, [type]: ordered };
      savePrefs(np);
      return np;
    });
  }

  function setAllColumns(on: boolean) {
    const next = on ? columns.map((c) => c.key) : [];
    setPrefs((p) => {
      const np = { ...p, [type]: next };
      savePrefs(np);
      return np;
    });
  }

  /* ---- data loading ---- */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ type, page: String(page), pageSize: String(pageSize) });
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const res = await fetch(`/api/reports?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        toast(json?.error ?? "Could not load the report.", "error");
        setData(null);
        return;
      }
      setData(json);
    } catch {
      toast("Connection lost.", "error");
    } finally {
      setLoading(false);
    }
  }, [type, from, to, page, pageSize]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPrefs(loadPrefs());
    getReportDir().then((d) => setDirName(d?.name ?? null));
  }, []);

  /* ---- keep the filter state in the URL so a report is shareable and a
         refresh does not silently reset the range ---- */
  const hydrated = useRef(false);
  useEffect(() => {
    // Adopt anything already in the URL exactly once, on mount.
    if (hydrated.current) return;
    hydrated.current = true;
    const q = new URLSearchParams(window.location.search);
    const qType = q.get("type");
    const qFrom = q.get("from");
    const qTo = q.get("to");
    if (qType && REPORTS.some((r) => r.id === qType)) setType(qType);
    if (qFrom !== null || qTo !== null) {
      setFrom(qFrom ?? "");
      setTo(qTo ?? "");
      setPreset("custom");
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const q = new URLSearchParams();
    q.set("type", type);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [type, from, to]);

  /* close the column popover on outside click */
  useEffect(() => {
    if (!colsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setColsOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [colsOpen]);

  /* ---- date handling ---- */
  function applyPreset(id: PresetId) {
    const r = resolvePreset(id);
    setPreset(id);
    setFrom(r.from);
    setTo(r.to);
    setPage(1);
  }

  function setFromManual(v: string) {
    setFrom(v);
    setPreset("custom");
    setPage(1);
  }
  function setToManual(v: string) {
    setTo(v);
    setPreset("custom");
    setPage(1);
  }

  /* ---- export ---- */
  const exportPayload: SheetPayload | null = data ? { ...data, visibleKeys } : null;

  async function onPdf() {
    if (!exportPayload) return;
    setExporting("pdf");
    try {
      const result = await exportReportPdf(exportPayload);
      toast(result === "saved" ? `Report saved to ${dirName ?? "your reports folder"}.` : "Report PDF downloaded.", "success");
    } catch (err) {
      // Log the real cause: "PDF export failed." on its own is unactionable.
      console.error("[reports] PDF export failed:", err);
      toast(`PDF export failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setExporting(null);
    }
  }

  function onCsv() {
    if (!exportPayload) return;
    try {
      exportReportCsv(exportPayload);
    } catch {
      toast("CSV export failed.", "error");
    }
  }

  async function onChooseDir() {
    const name = await chooseReportDir();
    if (name) {
      setDirName(name);
      toast(`Reports will be saved to "${name}".`, "success");
    }
  }

  /* ---- scale the 1123px sheet down to fit narrow screens ---- */
  // `transform: scale()` doesn't shrink the layout box, so the wrapper keeps its
  // full height and leaves a gap. Measure the sheet and set the height back.
  const [scale, setScale] = useState(1);
  const [sheetH, setSheetH] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stageRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;
    const fit = () => setScale(Math.min(1, (el.clientWidth - 26) / 1123));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const ro2 = new ResizeObserver(() => setSheetH(inner.getBoundingClientRect().height / (scale || 1)));
    ro2.observe(inner);
    return () => {
      ro.disconnect();
      ro2.disconnect();
    };
  }, [data, scale]);

  const totalPages = data ? Math.max(1, Math.ceil(data.rowCount / pageSize)) : 1;

  return (
    <div className="space-y-4">
      {/* ---------------- toolbar ---------------- */}
      <div className="page-head no-print">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Nine live report types · date range, summary, chart and exportable data</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative" ref={colsRef}>
            <Button
              variant="secondary"
              icon="settings"
              onClick={() => setColsOpen((v) => !v)}
              disabled={!columns.length}
              aria-expanded={colsOpen}
            >
              Columns ({selected.length}/{columns.length})
            </Button>

            {colsOpen && (
              <div
                className="absolute right-0 mt-2 z-50 w-[268px] card card-pad shadow-[var(--shadow-pop)]"
                role="dialog"
                aria-label="Choose export columns"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-semibold text-[var(--text)]">Export columns</p>
                  <div className="flex items-center gap-1">
                    <button className="btn btn-ghost btn-sm" onClick={() => setAllColumns(true)}>
                      All
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAllColumns(false)}>
                      None
                    </button>
                  </div>
                </div>
                <p className="text-[11.5px] text-faint leading-relaxed mb-3">
                  Picks which columns land in the PDF and CSV. The preview above always shows everything.
                </p>
                <div className="max-h-[280px] overflow-y-auto flex flex-col gap-0.5">
                  {columns.map((c) => {
                    const on = selected.includes(c.key);
                    return (
                      <label
                        key={c.key}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--surface-2)] transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleColumn(c.key)}
                          className="w-[15px] h-[15px] accent-[#1B5DB1] shrink-0"
                        />
                        <span className={`text-[12.5px] ${on ? "text-[var(--text)]" : "text-faint"}`}>{c.label}</span>
                      </label>
                    );
                  })}
                </div>
                <button className="btn btn-secondary w-full mt-3" onClick={() => setColsOpen(false)}>
                  Done
                </button>
              </div>
            )}
          </div>

          <Button variant="secondary" icon="file" onClick={onCsv} disabled={!data}>
            CSV
          </Button>
          <Button icon="printer" onClick={onPdf} busy={exporting === "pdf"} disabled={!data}>
            Export PDF
          </Button>
        </div>
      </div>

      {/* ---------------- filters ---------------- */}
      <div className="card card-pad no-print space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="block min-w-[240px] flex-1">
            <span className="lbl">Report type</span>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
              className="inp"
            >
              {REPORTS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="lbl">From</span>
            <input type="date" value={from} onChange={(e) => setFromManual(e.target.value)} className="inp" />
          </label>
          <label className="block">
            <span className="lbl">To</span>
            <input type="date" value={to} onChange={(e) => setToManual(e.target.value)} className="inp" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-faint me-1">Quick range</span>
          <div className="seg max-w-full overflow-x-auto" role="radiogroup" aria-label="Quick date range">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={preset === p.id}
                onClick={() => applyPreset(p.id)}
                className={`!h-[30px] !px-3 !text-[12.5px] whitespace-nowrap ${preset === p.id ? "on" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <span className="badge badge-blue">Custom range</span>
          )}
          {from || to ? (
            <button className="btn btn-ghost btn-sm ms-auto" onClick={() => applyPreset("all")}>
              <Icon name="x" size={13} />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {/* ---------------- loading ---------------- */}
      {loading ? (
        <div className="card card-pad">
          <Skeleton rows={9} cards={3} />
        </div>
      ) : !data ? (
        <div className="card card-pad">
          <EmptyState
            icon="chart"
            title="No report loaded"
            message="Pick a report type and a date range to generate a live preview."
          />
        </div>
      ) : (
        <>
          {/* ---------------- summary cards ---------------- */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 no-print">
            {data.summary.map((s, i) => (
              <SummaryTile key={s.key} item={s} featured={i === 0 && s.tone === "neutral"} />
            ))}
          </div>

          {/* ---------------- sheet preview ---------------- */}
          <div className="card no-print overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-lg bg-[var(--brand-50)] text-[#1B5DB1] flex items-center justify-center shrink-0">
                  <Icon name={active.icon} size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[var(--text)] truncate">{data.title}</p>
                  <p className="text-[11.5px] text-faint truncate">
                    {rangeText(data.meta)} · {data.rowCount} record{data.rowCount === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <span className="text-[11px] text-faint">
                A4 landscape · exports the range above
              </span>
            </div>

            <div ref={stageRef} className="rs-scale p-3 bg-[var(--surface-2)]">
              <div
                ref={innerRef}
                className="rs-scale-inner"
                style={scale < 1 ? { transform: `scale(${scale})`, height: sheetH ? sheetH * scale : undefined } : undefined}
              >
                <div className="rounded-xl overflow-hidden shadow-[var(--shadow-card)]">
                  {/* Every column, always — the picker scopes the export only. */}
                  <ReportSheet payload={data} />
                </div>
              </div>
            </div>
          </div>

          {/* ---------------- paging ---------------- */}
          {data.rowCount > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2 text-[13px] text-faint">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-[12.5px]"
                  aria-label="Rows per page"
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s} per page
                    </option>
                  ))}
                </select>
                <span className="tabular">
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.rowCount)} of {data.rowCount}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <Icon name="arrowLeft" size={14} />
                  Prev
                </button>
                <span className="text-[12.5px] text-faint tabular px-2">
                  {page} / {totalPages}
                </span>
                <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
            </div>
          )}

          {/* ---------------- save folder ---------------- */}
          {fsAccessSupported() && (
            <div className="flex flex-wrap items-center gap-3 no-print">
              <Button variant="ghost" icon="folder" onClick={onChooseDir}>
                {dirName ? `Reports folder: ${dirName}` : "Choose a folder for reports"}
              </Button>
              <span className="text-[11.5px] text-faint">
                {dirName
                  ? "PDFs are written straight into that folder."
                  : "Pick a folder once and every later PDF lands there."}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- pieces ---------------- */

function SummaryTile({ item, featured }: { item: SheetPayload["summary"][number]; featured?: boolean }) {
  const tone =
    item.tone === "good"
      ? "text-success"
      : item.tone === "bad"
      ? "text-danger"
      : item.tone === "warn"
      ? "text-[var(--warn)]"
      : "text-[var(--text)]";
  return (
    <div className={`card stat${featured ? " featured" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`stat-label ${featured ? "!text-[#1B5DB1]" : ""}`}>{item.label}</p>
        {featured && <Icon name="chart" size={15} className="text-[#1B5DB1] shrink-0" />}
      </div>
      <p className={`stat-value tabular ${featured ? "!text-[26px] !text-[#1B5DB1]" : ""} ${tone}`}>{item.value}</p>
      {item.sub && <p className="stat-sub">{item.sub}</p>}
    </div>
  );
}
