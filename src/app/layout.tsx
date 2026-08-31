import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Cardápio Digital",
    template: "%s | Cardápio Digital",
  },
  description:
    "Cardápio digital para bares e restaurantes: escaneie o QR Code da mesa, veja o menu e faça seu pedido.",
  applicationName: "Cardápio Digital",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Cardápio Digital",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f97316" },
    { media: "(prefers-color-scheme: dark)", color: "#7c2d12" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
