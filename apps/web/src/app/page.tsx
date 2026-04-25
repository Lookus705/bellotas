"use client";

import { FormEvent, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export default function HomePage() {
  const [tenantSlug, setTenantSlug] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("Introduce tu tenant, codigo de empleado y PIN.");
  const [status, setStatus] = useState<"info" | "error" | "success">("info");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("info");
    setMessage("Validando credenciales y preparando el panel...");

    try {
      const response = await fetch(`${API_BASE_URL}/auth/web/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantSlug, employeeCode, pin })
      });

      if (!response.ok) {
        setStatus("error");
        setMessage("Credenciales invalidas o usuario sin acceso web.");
        return;
      }

      const data = await response.json();
      const roles = data.user.roles as string[];
      setStatus("success");
      setMessage("Sesion iniciada. Redirigiendo...");

      if (roles.includes("rrhh")) {
        window.location.href = "/rrhh";
        return;
      }

      window.location.href = "/manager";
    } catch {
      setStatus("error");
      setMessage("No se pudo conectar con la API local. Revisa que el backend este levantado.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="card hero-card login-card stack">
        <div className="brand">
          <p>Plataforma operativa multitenant</p>
          <h1>Acceso al espacio de trabajo</h1>
          <p>
            Accede al panel interno de tu empresa para gestionar operacion, empleados, documentos y configuracion segun tu rol.
          </p>
        </div>
      </section>

      <section className="card login-card stack">
        <div>
          <h2 className="section-title">Login web</h2>
          <p className="section-subtitle">
            El acceso depende del tenant y del rol asignado al empleado.
          </p>
        </div>

        <form onSubmit={onSubmit} className="form-grid">
          <input
            className="input"
            value={tenantSlug}
            onChange={(event) => setTenantSlug(event.target.value)}
            placeholder="Tenant o slug de la empresa"
          />
          <input
            className="input"
            value={employeeCode}
            onChange={(event) => setEmployeeCode(event.target.value)}
            placeholder="Codigo de empleado"
          />
          <input
            className="input"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            placeholder="PIN"
            type="password"
          />
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Iniciando sesion..." : "Entrar al panel"}
          </button>
        </form>

        <div className={`status ${status}`}>
          {message}
        </div>

        <div className="grid grid-3">
          <div className="card">
            <h3 className="section-title">Acceso por rol</h3>
            <p className="muted">Cada usuario entra con los permisos y vistas correspondientes a su funcion.</p>
          </div>
          <div className="card">
            <h3 className="section-title">Multitenant</h3>
            <p className="muted">La configuracion, documentos y datos operativos se separan por empresa.</p>
          </div>
          <div className="card">
            <h3 className="section-title">Canales operativos</h3>
            <p className="muted">La operacion puede entrar por Telegram y continuar en panel web interno.</p>
          </div>
          <div className="card">
            <h3 className="section-title">Demo local</h3>
            <p className="muted">Si estas en entorno de prueba, usa `demo-logistica` y un codigo demo como `ADMIN001`, `MGR001` o `RRHH001`.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
