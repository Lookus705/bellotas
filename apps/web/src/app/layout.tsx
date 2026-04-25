import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Plataforma operativa multitenant",
  description: "Panel interno multitenant para operacion, empleados, documentos y automatizacion asistida"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
