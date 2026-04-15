"use client";

import { FormEvent, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export default function HomePage() {
  const [tenantSlug, setTenantSlug] = useState("demo-logistica");
  const [employeeCode, setEmployeeCode] = useState("MGR001");
  const [pin, setPin] = useState("1234");
  const [message, setMessage] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Iniciando sesion...");
    const response = await fetch(`${API_BASE_URL}/auth/web/login`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantSlug, employeeCode, pin })
    });

    if (!response.ok) {
      setMessage("Credenciales invalidas o rol sin acceso web.");
      return;
    }

    const data = await response.json();
    const roles = data.user.roles as string[];
    if (roles.includes("rrhh")) {
      window.location.href = "/rrhh";
      return;
    }
    window.location.href = "/manager";
  }

  return (
    <main className="shell">
      <div className="card" style={{ maxWidth: 520, margin: "60px auto" }}>
        <h1>Bellotas MVP 1</h1>
        <p className="muted">Login web basico para manager y RRHH.</p>
        <form onSubmit={onSubmit} className="grid">
          <input className="input" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} placeholder="Tenant slug" />
          <input className="input" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="Codigo de empleado" />
          <input className="input" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" type="password" />
          <button className="button" type="submit">Entrar</button>
        </form>
        <p className="muted">{message}</p>
      </div>
    </main>
  );
}
