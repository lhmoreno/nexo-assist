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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
