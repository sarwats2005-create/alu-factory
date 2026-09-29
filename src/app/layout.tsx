import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/Toast";
import GhostFibers from "@/components/GhostFibers";

export const metadata: Metadata = {
  title: "ALU FACTORY — Aluminum Operations Management",
  description: "Production-grade ERP for aluminum factory operations",
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml," +
          encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1B5DB1"/><path d="M14 46V28l10 6v-14l10 6V18l16 10v18z" fill="#fff"/></svg>`
          ),
        type: "image/svg+xml",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Runs before first paint: restores the saved theme (default: dark — the
 * original GhostFiber midnight look) so there is no flash of wrong theme.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem("alu_theme");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.classList.add(t);}catch(e){document.documentElement.classList.add("dark");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="antialiased">
        {/*
          Global background infrastructure — mounted ONCE for the whole app.
          Layer 0: GhostFibers WebGL canvas (fixed, pointer-events: none)
          Layer 1: readability softener (light wash + 2px blur)
          Layer 2: application UI (this children tree)
          Layer 3+: modals/popovers/toasts (existing z-indexes)
        */}
        <GhostFibers
          lineColor="#140E35"
          glowColor="#3437A0"
          speed={0.2}
          scale={2}
          rotation={0}
          rotationSpeed={0.25}
          layers={4}
          waveAmplitude={0.015}
          waveFrequency={3}
          waveSpeed={0.15}
          layerSpeed={0.08}
          twist={0.1}
          twistFrequency={5}
          twistSpeed={1.2}
          lineFrequency={5}
          lineSpacing={2}
          lineSharpness={16}
          glowFalloff={10}
          glowIntensity={1.6}
          brightness={2}
          blueBoost={1.25}
          vignette={0.8}
          grain={0.05}
          dpr={1}
          fps={30}
        />
        <div className="background-softener" aria-hidden="true" />

        <div className="app-content">{children}</div>

        <Toaster />
      </body>
    </html>
  );
}
