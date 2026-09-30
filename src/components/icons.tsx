import { ReactNode } from "react";

/**
 * ALU FACTORY icon set — 24px grid, 1.8px stroke, Lucide-style geometry.
 * Usage: <Icon name="users" size={18} />
 */
const P: Record<string, ReactNode> = {
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </>
  ),
  users: (
    <>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M17 11.2a3 3 0 0 0 0-6" />
      <path d="M20 19v-1.4a3.3 3.3 0 0 0-2.4-3.1" />
    </>
  ),
  handshake: (
    <>
      <path d="M11 17 8.4 14.4a1.9 1.9 0 0 1 0-2.7l3.2-3.2a1.9 1.9 0 0 1 2.7 0L17 11.2" />
      <path d="m13.5 8.5 2.6-2.6a1.9 1.9 0 0 1 2.7 0l2.4 2.4a1.9 1.9 0 0 1 0 2.7L17 15.2" />
      <path d="m8.4 11.7-2.9 2.9a1.9 1.9 0 0 0 0 2.7l2.3 2.3a1.9 1.9 0 0 0 2.7 0l.6-.6" />
      <path d="M3 8l3.5-3.5L10 8" />
    </>
  ),
  box: (
    <>
      <path d="M20.5 7.8 12 3.5 3.5 7.8v8.4L12 20.5l8.5-4.3Z" />
      <path d="M3.7 7.9 12 12l8.3-4.1" />
      <path d="M12 12v8.4" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3.5h14a1 1 0 0 1 1 1V20l-2.6-1.6L14.8 20l-2.8-1.6L9.2 20l-2.6-1.6L4 20V4.5a1 1 0 0 1 1-1Z" />
      <path d="M8.5 8h7" />
      <path d="M8.5 11.5h7" />
      <path d="M8.5 15h4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.4 3 7.7 7 9 4-1.3 7-4.6 7-9V6Z" />
      <path d="m9.3 11.8 1.9 1.9 3.6-3.6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v15.5h16" />
      <path d="M8 15.5v-5" />
      <path d="M12.5 15.5V8" />
      <path d="M17 15.5v-3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.5v2.3M12 18.2v2.3M4.8 7.8l2 1.15M17.2 15.05l2 1.15M4.8 16.2l2-1.15M17.2 8.95l2-1.15" />
      <path d="M3.5 12h2.3M18.2 12h2.3" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9.5a6 6 0 0 0-12 0c0 4.5-1.5 5.5-1.5 5.5h15S18 14 18 9.5" />
      <path d="M10 18.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-3.4-3.4" />
    </>
  ),
  arrowLeft: <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  arrowUpRight: <path d="M7 17 17 7m0 0h-8m8 0v8" />,
  arrowDownRight: <path d="m7 7 10 10m0 0V9m0 8H9" />,
  minus: <path d="M5 12h14" />,
  dollar: (
    <>
      <path d="M12 2.5v19" />
      <path d="M16.5 6.5c-.8-1.2-2.4-2-4.5-2-2.6 0-4.5 1.3-4.5 3.3 0 4.4 9 2.5 9 6.9 0 2-1.9 3.3-4.5 3.3-2.1 0-3.7-.8-4.5-2" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10m0 0 4-4m-4 4-4-4" />
      <path d="M4.5 16.5V18a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1.5" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8V3.5h10V8" />
      <rect x="4" y="8" width="16" height="8" rx="1.5" />
      <path d="M7 13h10v7.5H7Z" />
    </>
  ),
  logout: (
    <>
      <path d="M9 20H6a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 6 4h3" />
      <path d="M15 16l4-4-4-4" />
      <path d="M19 12H9" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20.5 13.5A8.5 8.5 0 0 1 10.5 3.5a8.5 8.5 0 1 0 10 10Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  alert: (
    <>
      <path d="M12 9v4.5" />
      <circle cx="12" cy="16.8" r="0.4" fill="currentColor" />
      <path d="M10.3 4.6 2.8 17.5A1.8 1.8 0 0 0 4.4 20.3h15.2a1.8 1.8 0 0 0 1.6-2.8L13.7 4.6a1.9 1.9 0 0 0-3.4 0Z" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4.5L20 8.5a2.1 2.1 0 0 0-3-3L5.5 17 4 20Z" />
      <path d="m14.5 7 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9 6V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V6" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  scale: (
    <>
      <path d="M12 4v16" />
      <path d="M8 20h8" />
      <path d="M12 6.5 6 8m6-1.5L18 8" />
      <path d="M6 8l-2.8 6a3.2 3.2 0 0 0 5.6 0Z" />
      <path d="M18 8l-2.8 6a3.2 3.2 0 0 0 5.6 0Z" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8.5V7a1.5 1.5 0 0 0-1.5-1.5h-13A1.5 1.5 0 0 0 4 7v10a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 17v-1.5" />
      <path d="M14.5 8.5h5.4a.6.6 0 0 1 .6.6v5.8a.6.6 0 0 1-.6.6h-5.4a3.5 3.5 0 0 1 0-7Z" />
      <circle cx="15" cy="12" r="0.4" fill="currentColor" />
    </>
  ),
  factory: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M4.5 20.5V9l5 3V9l5 3V6.5l5 3v11" />
      <path d="M7.5 16.5h2M14 16.5h2" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  folder: (
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
  ),
  timer: (
    <>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 10v3.5l2.5 1.5" />
      <path d="M10 2.5h4" />
      <path d="M12 2.5V4" />
    </>
  ),
  TrendingUp: <path d="m3 17 6-6 4 4 8-8m0 0h-6m6 0v6" />,
  TrendingDown: <path d="m3 7 6 6 4-4 8 8m0 0h-6m6 0v-6" />,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />,
  mapPin: (
    <>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M10.6 6c.46-.08.93-.12 1.4-.12 6 0 9.5 6.12 9.5 6.12a17.6 17.6 0 0 1-2.3 3.1" />
      <path d="M6.6 6.8C4 8.7 2.5 12 2.5 12S6 18.5 12 18.5c1.5 0 2.9-.4 4.1-1" />
      <path d="M9.9 10.1a2.9 2.9 0 0 0 4 4" />
    </>
  ),
  scale2: (
    <>
      <path d="M12 4v16M8 20h8" />
      <rect x="9" y="4" width="6" height="2.5" rx="0.6" />
      <path d="M9.5 6.5 6.8 12a3 3 0 0 0 5.4 0Z" />
      <path d="M14.5 6.5 11.8 12a3 3 0 0 0 5.4 0Z" transform="translate(2.7 0)" />
    </>
  ),
};

export type IconName = keyof typeof P;

export function Icon({
  name,
  size = 18,
  className = "",
  strokeWidth = 1.8,
}: {
  name: IconName | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {P[name] ?? P.grid}
    </svg>
  );
}
