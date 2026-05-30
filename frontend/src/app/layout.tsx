import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { QueryProvider } from "@/lib/query-client";
import "@/styles/globals.css";

// Sistema de diseño "Bóveda": Geist Sans (UI), Geist Mono (números/metadata),
// Instrument Serif italic (acentos editoriales). Una sola dirección oscura premium.
const geistSans = Geist({
  variable: "--font-geist-sans",
  weight: ["100", "200", "300", "400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: ["400"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mis Finanzas V2",
  description: "Dashboard financiero personal",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Finanzas", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Anti-flash: aplica data-theme desde localStorage antes de hidratar. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem("boveda-theme");var t="dark";if(s){var v=JSON.parse(s);if(v&&v.state&&(v.state.theme==="light"||v.state.theme==="dark"))t=v.state.theme;}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
