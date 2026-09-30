"use client";

/* ==========================================================================
   Report sheet
   --------------------------------------------------------------------------
   The printable document for every report type. It is rendered twice from the
   same markup: once on screen as the live preview, and once off-screen by
   report-pdf.ts for capture. Because both paths use this component, what the
   user previews is exactly what lands in the PDF.

   Always light-themed on purpose — see the `.rs` block in globals.css.
   ========================================================================== */

export type SheetColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
};

export type SheetSummary = {
  key: string;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "warn" | "neutral";
};

export type SheetChart = {
  title: string;
  unit?: "usd" | "kg" | "count";
  data: { label: string; value: number; color?: "brand" | "danger" | "success" | "warn" }[];
};

export type SheetPayload = {
  type: string;
  title: string;
  subtitle: string;
  meta: { from: string | null; to: string | null; generatedAt: string; exchangeRate: number };
  summary: SheetSummary[];
  chart: SheetChart | null;
  columns: SheetColumn[];
  rows: Record<string, string>[];
  totals: Record<string, string> | null;
  rowCount: number;
  note: string | null;
  page?: number;
  pageSize?: number;
  /** Applied by the column picker; unset means "every column". */
  visibleKeys?: string[];
};

/* ---------------- formatting ---------------- */

/** ISO date → DD/MM/YYYY. Empty stays empty so blank cells stay blank. */
function prettyDate(iso: string) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

const unitLabel = (unit: SheetChart["unit"]) => (unit === "kg" ? "kg" : unit === "count" ? "" : "USD");

/** Compact money for the bar labels — full precision crowds a 132px chart. */
function axisValue(v: number, unit: SheetChart["unit"]) {
  const abs = Math.abs(v);
  if (unit === "kg") return abs >= 1000 ? `${Math.round(v).toLocaleString("en-US")}` : abs.toFixed(abs < 10 ? 1 : 0);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return v.toFixed(0);
}

/** The range as a single human sentence. */
export function rangeText(meta: SheetPayload["meta"]) {
  if (meta.from && meta.to) {
    return meta.from === meta.to ? prettyDate(meta.from) : `${prettyDate(meta.from)} — ${prettyDate(meta.to)}`;
  }
  if (meta.from) return `${prettyDate(meta.from)} — today`;
  if (meta.to) return `Start — ${prettyDate(meta.to)}`;
  return "All time";
}

export function fileSlug(payload: { type: string; meta: SheetPayload["meta"] }) {
  const parts = [payload.type, payload.meta.from ?? "all", payload.meta.to ?? "now"];
  return parts.join("-");
}

/* ---------------- pieces ---------------- */

function Header({ payload }: { payload: SheetPayload }) {
  return (
    <div className="rs-head">
      <div className="rs-head-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="rs-head-logo" src="/app-icon.png" alt="" />
        <div>
          <div className="rs-head-name">ALU FACTORY</div>
          <div className="rs-head-tag">Aluminum Operations Management</div>
        </div>
      </div>
      <div className="rs-head-meta">
        <div className="rs-head-title">{payload.title}</div>
        <div>
          <span className="rs-head-range">{rangeText(payload.meta)}</span>
        </div>
        <div className="rs-head-sub">
          {payload.subtitle} · Generated{" "}
          {new Date(payload.meta.generatedAt).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · 1 USD = {payload.meta.exchangeRate.toLocaleString("en-US")} IQD
        </div>
      </div>
    </div>
  );
}

function Summary({ items }: { items: SheetSummary[] }) {
  if (items.length === 0) return null;
  return (
    <div className="rs-summary">
      {items.map((s, i) => {
        // The first tile is the headline number, so it gets the brand treatment.
        const featured = i === 0 && s.tone === "neutral";
        return (
          <div
            key={s.key}
            className={`rs-tile${s.tone && s.tone !== "neutral" ? ` is-${s.tone}` : ""}${featured ? " is-featured" : ""}`}
          >
            <div className="rs-tile-label" title={s.label}>
              {s.label}
            </div>
            <div className="rs-tile-value">{s.value}</div>
            {s.sub ? <div className="rs-tile-sub">{s.sub}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function BarChart({ chart }: { chart: SheetChart | null }) {
  if (!chart || chart.data.length === 0) return null;

  // Scale against the largest magnitude so a chart of losses still fills the box.
  const max = Math.max(...chart.data.map((d) => Math.abs(d.value)), 1);
  const unit = unitLabel(chart.unit);

  return (
    <div className="rs-chart">
      <div className="rs-chart-head">
        <div className="rs-chart-title">{chart.title}</div>
        <div className="rs-chart-unit">{unit ? `Amount (${unit})` : "Amount"}</div>
      </div>
      <div className="rs-bars">
        {chart.data.map((d, i) => {
          const pctOfMax = (Math.abs(d.value) / max) * 100;
          return (
            <div className="rs-bar" key={`${d.label}-${i}`}>
              <span className="rs-bar-value">
                {axisValue(d.value, chart.unit)}
                {unit === "USD" ? "" : unit ? ` ${unit}` : ""}
              </span>
              <div
                className={`rs-bar-fill${d.color && d.color !== "brand" ? ` is-${d.color}` : ""}`}
                style={{ height: `${Math.max(1.5, pctOfMax)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="rs-bar-labels">
        {chart.data.map((d, i) => (
          <div className="rs-bar-label" key={`${d.label}-lbl-${i}`} title={d.label}>
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ payload, columns }: { payload: SheetPayload; columns: SheetColumn[] }) {
  const cellClass = (c: SheetColumn) => (c.align === "right" ? "num" : c.align === "center" ? "mid" : "");

  return (
    <div className="rs-table-wrap">
      <table className="rs-table">
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={{ width: c.width ?? "auto" }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cellClass(c)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payload.rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const raw = row[c.key] ?? "";
                const value = c.key.toLowerCase().includes("date") ? prettyDate(raw) : raw;
                return (
                  <td key={c.key} className={`${cellClass(c)} ${i === 0 ? "key" : ""}`.trim()}>
                    {value || "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {payload.totals && (
          <tfoot>
            <tr>
              {columns.map((c) => (
                <td key={c.key} className={cellClass(c)}>
                  {payload.totals?.[c.key] ?? ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Signatures() {
  return (
    <div className="rs-sign">
      <div className="rs-sign-slot">Prepared by</div>
      <div className="rs-sign-slot">Checked by</div>
      <div className="rs-sign-slot">Approved by</div>
    </div>
  );
}

/* ---------------- the sheet ---------------- */

export default function ReportSheet({
  payload,
  showPageFooter = true,
  variant = "full",
}: {
  payload: SheetPayload;
  showPageFooter?: boolean;
  /** `header` renders only the identity block, for repeated PDF page headers. */
  variant?: "full" | "header";
}) {
  const visible = payload.visibleKeys?.length
    ? payload.columns.filter((c) => payload.visibleKeys!.includes(c.key))
    : payload.columns;
  const shown = visible.length > 0 ? visible : payload.columns;

  if (variant === "header") {
    return (
      <div className="rs rs--band" data-report-type={payload.type}>
        <Header payload={payload} />
      </div>
    );
  }

  return (
    <div className="rs" data-report-type={payload.type}>
      <Header payload={payload} />
      <Summary items={payload.summary} />
      <BarChart chart={payload.chart} />
      {payload.rows.length > 0 ? (
        <DataTable payload={payload} columns={shown} />
      ) : (
        <div className="rs-table-wrap">
          <div style={{ padding: "34px 20px", textAlign: "center", color: "var(--rs-ink-3)", fontSize: 12 }}>
            No data found for the selected date range.
          </div>
        </div>
      )}
      {payload.note ? <div className="rs-note">{payload.note}</div> : null}
      <Signatures />
      {showPageFooter && (
        <div className="rs-foot">
          <span>
            ALU FACTORY · {payload.title} · {payload.rowCount} record{payload.rowCount === 1 ? "" : "s"}
          </span>
          <span>{rangeText(payload.meta)}</span>
        </div>
      )}
    </div>
  );
}
