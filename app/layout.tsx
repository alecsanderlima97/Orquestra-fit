import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Orquestra Fit | Plataforma de academias",
  description: "Gestão, treinos e evolução para academias no Orquestra Fit.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: "/branding/orquestra-cs/system-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/branding/orquestra-cs/system-icon-192.png",
    apple: "/branding/orquestra-cs/system-icon-180.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Orquestra Fit",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased"><Providers>{children}</Providers></body>
    </html>
  );
}
