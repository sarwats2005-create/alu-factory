export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="alu-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2A6FC9" />
          <stop offset="1" stopColor="#17509E" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#alu-g)" />
      <rect width="64" height="64" rx="15" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      <path d="M15 46.5V29l9.5 5.7V22l9.5 5.7V18.5L50 28v18.5z" fill="#fff" />
    </svg>
  );
}

export function LogoWithName({ size = 40, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Logo size={size} />
      <div>
        <p
          className={`font-bold tracking-[0.08em] leading-tight ${
            dark ? "text-white" : "text-[var(--text)]"
          }`}
        >
          ALU FACTORY
        </p>
        <p className={`text-[10px] leading-tight mt-0.5 ${dark ? "text-white/50" : "text-faint"}`}>
          Aluminum Operations Management
        </p>
      </div>
    </div>
  );
}
