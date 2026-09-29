// App logo mark. Uses the factory icon chosen by the owner
// (public/app-icon.png) everywhere the brand appears: sidebar, login,
// mobile bars, invoices, and PDFs.

export function Logo({ size = 40 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/app-icon.png"
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-[22%]"
      style={{ width: size, height: size }}
      draggable={false}
    />
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
