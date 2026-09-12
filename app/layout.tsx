import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Orquestra Fit | Dama de Ferro Academia",
  description: "Plataforma Orquestra Fit para gestão, professores e alunos da Dama de Ferro Academia.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
