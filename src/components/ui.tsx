"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { fmtMoney } from "@/lib/money";
import { Icon, type IconName } from "@/components/icons";
import SpecularButton from "@/components/SpecularButton";

/* ---------- Button ---------- */

export function Button({
  children,
  variant = "primary",
  busy,
  icon,
  className = "",
  ...props
}: {
  children?: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  busy?: boolean;
  icon?: IconName;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const content = (
    <>
      {busy ? (
        <Spinner />
      ) : (
        icon && <Icon name={icon} size={15} />
      )}
      {children}
    </>
  );

  // Blue (primary) buttons carry the specular rim highlight.
  if (variant === "primary") {
    const small = /\bbtn-sm\b/.test(className);
    const rest = className
      .replace(/\b(btn|btn-primary|btn-sm|btn-md|btn-lg)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return (
      <SpecularButton
        {...props}
        size={small ? "sm" : "md"}
        radius={small ? 8 : 10}
        className={rest}
        disabled={props.disabled || busy}
        aria-busy={busy || undefined}
      >
        {content}
      </SpecularButton>
    );
  }

  return (
    <button {...props} disabled={props.disabled || busy} className={`btn btn-${variant} ${className}`}>
      {content}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Form fields ---------- */

export function Input({
  label,
  error,
  hint,
  ...props
}: { label?: string; error?: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      {label && <span className="lbl">{label}</span>}
      <input {...props} className={`inp ${error ? "!border-[#D93025]" : ""}`} />
      {error ? (
        <span className="field-hint text-[#D93025]">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

export function Select({
  label,
  children,
  ...props
}: { label?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      {label && <span className="lbl">{label}</span>}
      <select {...props} className="inp">
        {children}
      </select>
    </label>
  );
}

export function Textarea({
  label,
  ...props
}: { label?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      {label && <span className="lbl">{label}</span>}
      <textarea {...props} className="inp" />
    </label>
  );
}

/* ---------- Badge ---------- */

export function Badge({
  kind,
  children,
  dot,
}: {
  kind: "green" | "red" | "orange" | "gray" | "blue";
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${kind}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/* ---------- Card ---------- */

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return <div className={`card ${pad ? "card-pad" : ""} ${className}`}>{children}</div>;
}

/* ---------- Stat card ---------- */

export function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
  featured,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
  icon?: IconName;
  featured?: boolean;
  className?: string;
}) {
  const color =
    tone === "good" ? "text-success" : tone === "bad" ? "text-danger" : "text-[var(--text)]";
  return (
    <div className={`card stat ${featured ? "featured" : ""} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`stat-label ${featured ? "!text-[var(--brand)]" : ""}`}>{label}</p>
        {icon && <Icon name={icon} size={featured ? 16 : 15} className={featured ? "text-[var(--brand)] shrink-0" : "text-faint shrink-0"} />}
      </div>
      <p className={`stat-value ${featured ? "!text-[28px] md:!text-[34px]" : ""} ${color}`}>{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}

/* ---------- Skeleton ---------- */

export function Skeleton({ rows = 5, cards = 0 }: { rows?: number; cards?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {cards > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: cards }).map((_, i) => (
            <div key={i} className="sk h-[92px]" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sk h-11" style={{ animationDelay: `${i * 70}ms` }} />
      ))}
    </div>
  );
}

/* ---------- Pagination ---------- */

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
      <div className="flex items-center gap-2 text-[13px] text-faint">
        {onPageSize && (
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="inp inp-sm"
            aria-label="Rows per page"
          >
            {[25, 50, 100].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <span className="tabular">
          {from}–{to} of {total}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <Icon name="arrowLeft" size={14} />
          Prev
        </button>
        <span className="text-[12.5px] text-faint tabular px-2">
          {page} / {pages}
        </span>
        <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

/* ---------- Empty state ---------- */

export function EmptyState({
  icon = "box",
  title,
  message,
  cta,
  onCta,
}: {
  icon?: IconName;
  title: string;
  message: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div className="text-center py-16 px-6">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--brand-50)] text-[#1B5DB1] flex items-center justify-center mb-4">
        <Icon name={icon} size={22} />
      </div>
      <p className="text-[15px] font-semibold text-[var(--text)]">{title}</p>
      <p className="text-[13px] text-muted max-w-sm mx-auto mt-1.5 leading-relaxed">{message}</p>
      {cta && onCta && (
        <Button onClick={onCta} icon="plus" className="mt-5">
          {cta}
        </Button>
      )}
    </div>
  );
}

/* ---------- Page header ---------- */

export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

/* ---------- Back link (detail pages) ---------- */

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="back-link">
      <Icon name="arrowLeft" size={14} />
      {children}
    </Link>
  );
}

/* ---------- Money ---------- */

export function Money({
  value,
  currency,
  signed,
  strong,
}: {
  value: string | number;
  currency?: string;
  signed?: boolean;
  strong?: boolean;
}) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  const cls = n < 0 ? "text-danger" : n > 0 && signed ? "text-success" : "";
  const prefix = currency === "IQD" ? "" : "$";
  const suffix = currency === "IQD" ? " IQD" : "";
  return (
    <span className={`tabular ${cls} ${strong ? "font-semibold" : ""}`}>
      {n < 0 ? "−" : ""}
      {prefix}
      {fmtMoney(Math.abs(n), currency)}
      {suffix}
    </span>
  );
}

/* ---------- Search input with icon ---------- */

export function SearchInput({
  onSearch,
  placeholder = "Search…",
  className = "",
}: {
  onSearch: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute start-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none">
        <Icon name="search" size={15} />
      </span>
      <input
        type="search"
        className="inp"
        style={{ paddingInlineStart: 36 }}
        placeholder={placeholder}
        onChange={(e) => onSearch(e.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}
