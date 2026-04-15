import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Bellotas MVP 1",
  description: "Panel operativo minimo"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
