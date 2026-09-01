import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orquestra Fit | Dama de Ferro Academia",
  description: "Experiência demonstrativa do Orquestra Fit para gestão, professores e alunos da Dama de Ferro Academia.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
