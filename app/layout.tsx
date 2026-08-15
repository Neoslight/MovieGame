import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const editorial = Instrument_Serif({
  variable: "--font-editorial",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const ui = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Contretype",
  description: "Un jeu de mémoire cinéphile construit sur ton profil Letterboxd.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Contretype" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4efe6" },
    { media: "(prefers-color-scheme: dark)", color: "#12100e" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${editorial.variable} ${ui.variable} h-full antialiased`}>
      <head>
        {/* Before the first paint, so a chosen theme never flashes through the
            system one on the way in. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="grain min-h-full">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
