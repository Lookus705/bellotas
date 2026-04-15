"use client";

import { FormEvent, useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export default function RRHHPage() {
  const [employeeCode, setEmployeeCode] = useState("DRV001");
  const [periodYear, setPeriodYear] = useState("2026");
  const [periodMonth, setPeriodMonth] = useState("4");
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  async function loadPayrolls() {
    const response = await fetch(`${API_BASE_URL}/payroll`, { credentials: "include" });
    if (response.ok) {
      setPayrolls(await response.json());
    }
  }

  useEffect(() => {
    void loadPayrolls();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = document.getElementById("payroll-file") as HTMLInputElement;
    if (!input.files?.[0]) {
      setMessage("Selecciona un PDF.");
      return;
    }

    const form = new FormData();
    form.append("employeeCode", employeeCode);
    form.append("periodYear", periodYear);
    form.append("periodMonth", periodMonth);
    form.append("file", input.files[0]);

    const response = await fetch(`${API_BASE_URL}/payroll/upload`, {
      method: "POST",
      credentials: "include",
      body: form
    });

    setMessage(response.ok ? "Nomina subida." : "No se pudo subir la nomina.");
    await loadPayrolls();
  }

  return (
    <main className="shell">
      <div className="grid grid-2">
        <section className="card">
          <h1>Panel RRHH</h1>
          <p className="muted">Subida minima de nominas PDF.</p>
          <form onSubmit={onSubmit} className="grid">
            <input className="input" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="Codigo empleado" />
            <input className="input" value={periodYear} onChange={(e) => setPeriodYear(e.target.value)} placeholder="Ano" />
            <input className="input" value={periodMonth} onChange={(e) => setPeriodMonth(e.target.value)} placeholder="Mes" />
            <input id="payroll-file" className="input" type="file" accept="application/pdf" />
            <button className="button" type="submit">Subir nomina</button>
          </form>
          <p className="muted">{message}</p>
        </section>

        <section className="card">
          <h2>Nominas cargadas</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Periodo</th>
                <th>Fecha carga</th>
              </tr>
            </thead>
            <tbody>
              {payrolls.map((payroll) => (
                <tr key={payroll.id}>
                  <td>{payroll.employee?.fullName}</td>
                  <td>{payroll.periodMonth}/{payroll.periodYear}</td>
                  <td>{new Date(payroll.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
