import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nexo Assist",
  description: "Service desk inteligente da Nexo",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Extensões do navegador injetam atributos antes da hidratação.
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
