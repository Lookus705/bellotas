"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, AuthExpiredError } from "../lib/api";

type CurrentUser = {
  fullName: string;
  employeeCode: string;
  roles: string[];
};

type AppNavProps = {
  title: string;
  subtitle: string;
};

export function AppNav({ title, subtitle }: AppNavProps) {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    async function loadMe() {
      try {
        const response = await apiFetch("/auth/me");
        if (!response.ok) {
          throw new Error("No se pudo cargar la sesion.");
        }

        const data = await response.json();
        setUser(data);
      } catch (error) {
        if (error instanceof AuthExpiredError) {
          window.location.href = "/";
        }
      }
    }

    void loadMe();
  }, []);

  const roles = user?.roles ?? [];
  const canSeeManager = roles.includes("manager") || roles.includes("admin");
  const canSeeRrhh = roles.includes("rrhh") || roles.includes("admin");
  const canSeeSettings = roles.includes("admin");

  const links = useMemo(() => {
    const items: Array<{ href: string; label: string }> = [];

    if (canSeeManager) {
      items.push({ href: "/manager", label: "Manager" });
    }

    if (canSeeSettings) {
      items.push({ href: "/settings", label: "Configuracion" });
    }

    if (canSeeRrhh) {
      items.push({ href: "/rrhh", label: "RRHH" });
    }

    items.push({ href: "/", label: "Salir" });
    return items;
  }, [canSeeManager, canSeeRrhh, canSeeSettings]);

  return (
    <div className="topbar">
      <div className="brand">
        <p>Workspace</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>

      <nav className="nav">
        {links.map((item) => (
          <Link
            key={item.href}
            className={`nav-link${pathname === item.href ? " active" : ""}`}
            href={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
