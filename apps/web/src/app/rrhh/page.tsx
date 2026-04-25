"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, API_BASE_URL, AuthExpiredError } from "../../lib/api";
import { AppNav } from "../../components/app-nav";

type PayrollItem = {
  id: string;
  periodYear: number;
  periodMonth: number;
  createdAt: string;
  employee?: {
    fullName: string;
    employeeCode: string;
  };
};

type EmployeeItem = {
  id: string;
  employeeCode: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  roles: string[];
  telegramLinked: boolean;
  telegramLastSeenAt?: string | null;
  createdAt?: string;
};

type TenantDocument = {
  id: string;
  category: string;
  title: string;
  description?: string | null;
  createdAt: string;
  useForAi?: boolean;
};

type PayrollDispatchResult = {
  employeeCode: string;
  fullName: string;
  status: "sent" | "skipped";
  reason?: string;
};

type PayrollValidationResult = {
  payrollId: string;
  employeeCode: string;
  fullName: string;
  status: "valid" | "blocked";
  reason?: string;
};

type PayrollValidationSummary = {
  totalSelected: number;
  validCount: number;
  blockedCount: number;
  results: PayrollValidationResult[];
};

type TemporaryPinState = {
  employeeCode: string;
  fullName: string;
  temporaryPin: string;
};

const defaultEditForm = {
  fullName: "",
  email: "",
  phone: "",
  roles: ["chofer"],
  status: "ACTIVE"
};

const defaultEmployeeForm = {
  employeeCode: "",
  fullName: "",
  email: "",
  phone: "",
  roles: ["chofer"]
};

const defaultDocumentForm = {
  title: "",
  description: "",
  category: "rrhh",
  useForAi: false
};

function formatDispatchReason(reason?: string) {
  if (!reason) return "-";

  switch (reason) {
    case "telegram_bot_not_configured":
      return "No hay bot de Telegram configurado.";
    case "employee_not_linked_to_telegram":
      return "El empleado no esta vinculado a Telegram.";
    case "employee_not_found":
      return "El empleado asociado ya no existe.";
    case "employee_inactive":
      return "El empleado esta inactivo.";
    case "missing_pdf":
      return "La nomina no tiene PDF asociado.";
    case "invalid_period":
      return "El periodo es invalido.";
    case "validation_failed":
      return "La validacion marco esta nomina como bloqueada.";
    default:
      return reason;
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.message === "string") {
      return data.message;
    }
    if (Array.isArray(data?.message) && data.message.length > 0) {
      return data.message.join(". ");
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export default function RRHHPage() {
  const [employeeCode, setEmployeeCode] = useState("DRV001");
  const [periodYear, setPeriodYear] = useState("2026");
  const [periodMonth, setPeriodMonth] = useState("4");
  const [payrolls, setPayrolls] = useState<PayrollItem[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [documents, setDocuments] = useState<TenantDocument[]>([]);
  const [message, setMessage] = useState(
    "RRHH puede gestionar empleados, nominas y documentos internos desde aqui."
  );
  const [status, setStatus] = useState<"info" | "error" | "success">("info");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isResettingPin, setIsResettingPin] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState(defaultEmployeeForm);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(defaultEditForm);
  const [documentForm, setDocumentForm] = useState(defaultDocumentForm);
  const [dispatchResults, setDispatchResults] = useState<PayrollDispatchResult[]>([]);
  const [validationSummary, setValidationSummary] = useState<PayrollValidationSummary | null>(null);
  const [selectedPayrollIds, setSelectedPayrollIds] = useState<string[]>([]);
  const [lastTemporaryPin, setLastTemporaryPin] = useState<TemporaryPinState | null>(null);

  async function loadData() {
    const [payrollResponse, employeeResponse, documentResponse] = await Promise.all([
      apiFetch("/payroll"),
      apiFetch("/hr/employees"),
      apiFetch("/settings/documents?area=rrhh")
    ]);

    if (
      payrollResponse.status === 403 ||
      employeeResponse.status === 403 ||
      documentResponse.status === 403
    ) {
      throw new Error("forbidden");
    }

    if (!payrollResponse.ok || !employeeResponse.ok || !documentResponse.ok) {
      throw new Error("No se pudo cargar RRHH.");
    }

    const [payrollData, employeeData, documentData] = await Promise.all([
      payrollResponse.json(),
      employeeResponse.json(),
      documentResponse.json()
    ]);

    setPayrolls(payrollData);
    setEmployees(employeeData);
    setDocuments(documentData);
  }

  useEffect(() => {
    async function run() {
      try {
        setIsLoading(true);
        await loadData();
      } catch (error) {
        if (error instanceof AuthExpiredError) {
          window.location.href = "/";
          return;
        }
        if (error instanceof Error && error.message === "forbidden") {
          setStatus("error");
          setMessage(
            "Tu sesion no tiene acceso al panel de RRHH. Entra con un usuario RRHH o admin."
          );
          return;
        }
        setStatus("error");
        setMessage("No se pudo cargar el panel de RRHH.");
      } finally {
        setIsLoading(false);
      }
    }

    void run();
  }, []);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === editingEmployeeId) ?? null,
    [employees, editingEmployeeId]
  );

  const visiblePayrolls = useMemo(
    () =>
      payrolls.filter(
        (item) =>
          item.periodYear === Number(periodYear) && item.periodMonth === Number(periodMonth)
      ),
    [payrolls, periodMonth, periodYear]
  );

  const effectiveSelectedPayrollIds = useMemo(
    () => (selectedPayrollIds.length > 0 ? selectedPayrollIds : visiblePayrolls.map((item) => item.id)),
    [selectedPayrollIds, visiblePayrolls]
  );

  function startEditEmployee(employee: EmployeeItem) {
    setEditingEmployeeId(employee.id);
    setEditForm({
      fullName: employee.fullName,
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      roles: employee.roles.length > 0 ? employee.roles : ["chofer"],
      status: employee.status
    });
  }

  function resetEditEmployee() {
    setEditingEmployeeId(null);
    setEditForm(defaultEditForm);
  }

  function togglePayrollSelection(payrollId: string) {
    setSelectedPayrollIds((current) =>
      current.includes(payrollId)
        ? current.filter((item) => item !== payrollId)
        : [...current, payrollId]
    );
  }

  function selectVisiblePayrolls() {
    setSelectedPayrollIds(visiblePayrolls.map((item) => item.id));
  }

  function clearPayrollSelection() {
    setSelectedPayrollIds([]);
  }

  async function onPayrollSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = document.getElementById("payroll-file") as HTMLInputElement;
    if (!input.files?.[0]) {
      setStatus("error");
      setMessage("Selecciona un PDF antes de subir la nomina.");
      return;
    }

    setIsSubmitting(true);
    setStatus("info");
    setMessage("Subiendo nomina...");

    try {
      const form = new FormData();
      form.append("employeeCode", employeeCode);
      form.append("periodYear", periodYear);
      form.append("periodMonth", periodMonth);
      form.append("file", input.files[0]);

      const response = await apiFetch("/payroll/upload", {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo subir la nomina."));
      }

      setStatus("success");
      setMessage("Nomina subida correctamente.");
      setDispatchResults([]);
      setValidationSummary(null);
      input.value = "";
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo subir la nomina.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onEmployeeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("info");
    setMessage("Creando empleado...");

    try {
      const response = await apiFetch("/hr/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(employeeForm)
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo crear el empleado."));
      }

      const created = await response.json();
      setEmployeeForm(defaultEmployeeForm);
      setLastTemporaryPin({
        employeeCode: created.employeeCode,
        fullName: created.fullName,
        temporaryPin: created.temporaryPin
      });
      setStatus("success");
      setMessage(`Empleado creado. PIN temporal generado para ${created.employeeCode}.`);
      setDispatchResults([]);
      setValidationSummary(null);
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo crear el empleado.");
    }
  }

  async function onEmployeeUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEmployee) {
      return;
    }

    setIsSavingEmployee(true);
    setStatus("info");
    setMessage("Guardando cambios del empleado...");

    try {
      const response = await apiFetch(`/hr/employees/${selectedEmployee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editForm.fullName,
          email: editForm.email || null,
          phone: editForm.phone || null,
          roles: editForm.roles,
          status: editForm.status
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo actualizar el empleado."));
      }

      setStatus("success");
      setMessage("Empleado actualizado.");
      setDispatchResults([]);
      setValidationSummary(null);
      resetEditEmployee();
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el empleado.");
    } finally {
      setIsSavingEmployee(false);
    }
  }

  async function onToggleEmployee(employee: EmployeeItem) {
    setStatus("info");
    setMessage("Actualizando empleado...");

    try {
      const response = await apiFetch(`/hr/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: employee.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
        })
      });

      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "No se pudo actualizar el estado del empleado.")
        );
      }

      setStatus("success");
      setMessage("Estado del empleado actualizado.");
      setDispatchResults([]);
      setValidationSummary(null);
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el empleado.");
    }
  }

  async function onResetPin(employee: EmployeeItem) {
    setIsResettingPin(employee.id);
    setStatus("info");
    setMessage(`Generando nuevo PIN temporal para ${employee.employeeCode}...`);

    try {
      const response = await apiFetch(`/hr/employees/${employee.id}/reset-pin`, {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo reiniciar el PIN."));
      }

      const result = await response.json();
      setLastTemporaryPin({
        employeeCode: result.employeeCode,
        fullName: result.fullName,
        temporaryPin: result.temporaryPin
      });
      setStatus("success");
      setMessage(`PIN temporal reiniciado para ${result.employeeCode}.`);
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo reiniciar el PIN.");
    } finally {
      setIsResettingPin(null);
    }
  }

  async function onUploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = document.getElementById("rrhh-document-file") as HTMLInputElement;
    if (!input.files?.[0]) {
      setStatus("error");
      setMessage("Selecciona un documento de RRHH.");
      return;
    }

    setStatus("info");
    setMessage("Subiendo documento...");

    try {
      const form = new FormData();
      form.append("area", "rrhh");
      form.append("category", documentForm.category);
      form.append("title", documentForm.title);
      form.append("description", documentForm.description);
      form.append("useForAi", String(documentForm.useForAi));
      form.append("file", input.files[0]);

      const response = await apiFetch("/settings/documents/upload", {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo subir el documento."));
      }

      setDocumentForm(defaultDocumentForm);
      input.value = "";
      setStatus("success");
      setMessage("Documento de RRHH subido.");
      setDispatchResults([]);
      setValidationSummary(null);
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo subir el documento.");
    }
  }

  async function onValidatePayrolls() {
    setStatus("info");
    setMessage("Validando envio de nominas...");

    try {
      const response = await apiFetch("/payroll/dispatch/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodYear,
          periodMonth,
          payrollIds: effectiveSelectedPayrollIds
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo validar el envio."));
      }

      const result = await response.json();
      setValidationSummary(result);
      setDispatchResults([]);
      setStatus("success");
      setMessage(
        `Validacion lista. Enviables: ${result.validCount}. Bloqueadas: ${result.blockedCount}.`
      );
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo validar el envio.");
      setValidationSummary(null);
    }
  }

  async function onDispatchPayrolls() {
    setStatus("info");
    setMessage("Enviando nominas por Telegram...");

    try {
      const response = await apiFetch("/payroll/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodYear,
          periodMonth,
          payrollIds: effectiveSelectedPayrollIds
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudieron enviar las nominas."));
      }

      const result = await response.json();
      setDispatchResults(result.results ?? []);
      setStatus("success");
      setMessage(`Envio completado. Enviadas: ${result.sent}. Omitidas: ${result.skipped}.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudieron enviar las nominas.");
      setDispatchResults([]);
    }
  }

  return (
    <main className="shell">
      <AppNav title="Panel RRHH" subtitle="Empleados, nominas y documentos internos." />

      <section className="card hero-card">
        <h2 className="section-title">RRHH operativo</h2>
        <p>
          Alta de empleados, PIN temporal, validacion de nominas y biblioteca interna desde un
          solo lugar.
        </p>
      </section>

      <section className="stack" style={{ marginTop: 20 }}>
        {isLoading ? <div className="status info">Cargando RRHH...</div> : null}
        <div className={`status ${status}`}>{message}</div>

        {lastTemporaryPin ? (
          <section className="card">
            <h2 className="section-title">PIN temporal generado</h2>
            <p className="section-subtitle">
              Comparte este PIN por un canal seguro. El empleado tendra que cambiarlo en su primer
              acceso por Telegram.
            </p>
            <div className="grid grid-3">
              <div className="card">
                <strong>Empleado</strong>
                <p className="muted">{lastTemporaryPin.fullName}</p>
              </div>
              <div className="card">
                <strong>Codigo</strong>
                <p className="muted">{lastTemporaryPin.employeeCode}</p>
              </div>
              <div className="card">
                <strong>PIN temporal</strong>
                <p className="muted">{lastTemporaryPin.temporaryPin}</p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="grid grid-2">
          <form onSubmit={onEmployeeSubmit} className="card stack">
            <div>
              <h2 className="section-title">Nuevo empleado</h2>
              <p className="section-subtitle">
                El sistema genera un PIN temporal automaticamente.
              </p>
            </div>

            <div className="field">
              <label>Codigo empleado</label>
              <input
                className="input"
                value={employeeForm.employeeCode}
                onChange={(event) =>
                  setEmployeeForm((current) => ({
                    ...current,
                    employeeCode: event.target.value.toUpperCase()
                  }))
                }
              />
            </div>
            <div className="field">
              <label>Nombre completo</label>
              <input
                className="input"
                value={employeeForm.fullName}
                onChange={(event) =>
                  setEmployeeForm((current) => ({ ...current, fullName: event.target.value }))
                }
              />
            </div>
            <div className="split">
              <div className="field">
                <label>Email</label>
                <input
                  className="input"
                  value={employeeForm.email}
                  onChange={(event) =>
                    setEmployeeForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label>Telefono</label>
                <input
                  className="input"
                  value={employeeForm.phone}
                  onChange={(event) =>
                    setEmployeeForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="field">
              <label>Rol principal</label>
              <select
                className="select"
                value={employeeForm.roles[0]}
                onChange={(event) =>
                  setEmployeeForm((current) => ({ ...current, roles: [event.target.value] }))
                }
              >
                <option value="chofer">Chofer</option>
                <option value="almacenista">Almacenista</option>
                <option value="supervisor">Supervisor</option>
                <option value="manager">Manager</option>
                <option value="rrhh">RRHH</option>
              </select>
            </div>

            <div className="actions">
              <button className="button" type="submit">
                Crear empleado
              </button>
            </div>
          </form>

          <form onSubmit={onPayrollSubmit} className="card stack">
            <div>
              <h2 className="section-title">Subir nomina PDF</h2>
              <p className="section-subtitle">
                Carga por empleado y periodo para despues validar y enviar.
              </p>
            </div>

            <div className="split">
              <div className="field">
                <label>Codigo empleado</label>
                <input
                  className="input"
                  value={employeeCode}
                  onChange={(event) => setEmployeeCode(event.target.value.toUpperCase())}
                />
              </div>
              <div className="field">
                <label>Ano</label>
                <input
                  className="input"
                  value={periodYear}
                  onChange={(event) => setPeriodYear(event.target.value)}
                />
              </div>
              <div className="field">
                <label>Mes</label>
                <input
                  className="input"
                  value={periodMonth}
                  onChange={(event) => setPeriodMonth(event.target.value)}
                />
              </div>
            </div>

            <input id="payroll-file" className="input" type="file" accept="application/pdf" />
            <div className="actions">
              <button className="button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Subiendo..." : "Subir nomina"}
              </button>
            </div>
          </form>
        </div>

        <div className="grid grid-2">
          <section className="card">
            <div className="row">
              <div>
                <h2 className="section-title">Empleados</h2>
                <p className="section-subtitle">
                  Estado, rol, vinculacion Telegram y reinicio de PIN temporal.
                </p>
              </div>
            </div>
            {employees.length === 0 ? (
              <div className="empty">Todavia no hay empleados cargados.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Rol</th>
                      <th>Estado</th>
                      <th>Telegram</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => (
                      <tr key={employee.id}>
                        <td>
                          <strong>{employee.fullName}</strong>
                          <div className="muted">{employee.employeeCode}</div>
                          <div className="muted">{employee.email || employee.phone || "-"}</div>
                        </td>
                        <td>{employee.roles.join(", ")}</td>
                        <td>
                          <span
                            className={`pill ${
                              employee.status === "ACTIVE" ? "closed" : "open"
                            }`}
                          >
                            {employee.status}
                          </span>
                        </td>
                        <td>
                          {employee.telegramLinked ? "Vinculado" : "Sin vincular"}
                          <div className="muted">
                            {employee.telegramLastSeenAt
                              ? `Ultima actividad ${new Date(
                                  employee.telegramLastSeenAt
                                ).toLocaleString()}`
                              : "-"}
                          </div>
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => startEditEmployee(employee)}
                            >
                              Editar
                            </button>
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => void onToggleEmployee(employee)}
                            >
                              {employee.status === "ACTIVE" ? "Desactivar" : "Activar"}
                            </button>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={isResettingPin === employee.id}
                              onClick={() => void onResetPin(employee)}
                            >
                              {isResettingPin === employee.id ? "Generando..." : "Reset PIN"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <form className="card stack" onSubmit={onEmployeeUpdate}>
            <div>
              <h2 className="section-title">Editar empleado</h2>
              <p className="section-subtitle">
                Ajusta datos, rol y estado. El reinicio de PIN genera un temporal nuevo.
              </p>
            </div>

            {!selectedEmployee ? (
              <div className="empty">Selecciona un empleado desde la tabla para editarlo.</div>
            ) : (
              <>
                <div className="card">
                  <strong>{selectedEmployee.fullName}</strong>
                  <div className="muted">{selectedEmployee.employeeCode}</div>
                </div>

                <div className="field">
                  <label>Nombre completo</label>
                  <input
                    className="input"
                    value={editForm.fullName}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, fullName: event.target.value }))
                    }
                  />
                </div>
                <div className="split">
                  <div className="field">
                    <label>Email</label>
                    <input
                      className="input"
                      value={editForm.email}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, email: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Telefono</label>
                    <input
                      className="input"
                      value={editForm.phone}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, phone: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="split">
                  <div className="field">
                    <label>Rol principal</label>
                    <select
                      className="select"
                      value={editForm.roles[0]}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, roles: [event.target.value] }))
                      }
                    >
                      <option value="chofer">Chofer</option>
                      <option value="almacenista">Almacenista</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="manager">Manager</option>
                      <option value="rrhh">RRHH</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Estado</label>
                    <select
                      className="select"
                      value={editForm.status}
                      onChange={(event) =>
                        setEditForm((current) => ({ ...current, status: event.target.value }))
                      }
                    >
                      <option value="ACTIVE">Activo</option>
                      <option value="INACTIVE">Inactivo</option>
                    </select>
                  </div>
                </div>

                <div className="actions">
                  <button className="button" type="submit" disabled={isSavingEmployee}>
                    {isSavingEmployee ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button className="button secondary" type="button" onClick={resetEditEmployee}>
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </form>
        </div>

        <div className="grid grid-2">
          <section className="card stack">
            <div className="row">
              <div>
                <h2 className="section-title">Nominas cargadas</h2>
                <p className="section-subtitle">
                  Seleccion parcial o total para validar y enviar por Telegram.
                </p>
              </div>
              <div className="actions">
                <button className="button secondary" type="button" onClick={selectVisiblePayrolls}>
                  Seleccionar periodo
                </button>
                <button className="button secondary" type="button" onClick={clearPayrollSelection}>
                  Limpiar
                </button>
              </div>
            </div>

            {visiblePayrolls.length === 0 ? (
              <div className="empty">No hay nominas del periodo seleccionado.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Empleado</th>
                      <th>Periodo</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePayrolls.map((payroll) => (
                      <tr key={payroll.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedPayrollIds.includes(payroll.id)}
                            onChange={() => togglePayrollSelection(payroll.id)}
                          />
                        </td>
                        <td>
                          <strong>{payroll.employee?.fullName ?? "Sin nombre"}</strong>
                          <div className="muted">{payroll.employee?.employeeCode ?? "-"}</div>
                        </td>
                        <td>
                          {String(payroll.periodMonth).padStart(2, "0")}/{payroll.periodYear}
                        </td>
                        <td>{new Date(payroll.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="card">
              <strong>Seleccion actual</strong>
              <p className="muted">
                {selectedPayrollIds.length > 0
                  ? `${selectedPayrollIds.length} nominas marcadas manualmente.`
                  : `Todas las nominas del periodo (${visiblePayrolls.length}).`}
              </p>
            </div>

            <div className="actions">
              <button className="button secondary" type="button" onClick={() => void onValidatePayrolls()}>
                Validar envio
              </button>
              <button className="button" type="button" onClick={() => void onDispatchPayrolls()}>
                Enviar seleccion
              </button>
            </div>

            {validationSummary ? (
              <div className="stack">
                <div className="grid grid-3">
                  <div className="card">
                    <strong>Total</strong>
                    <p className="muted">{validationSummary.totalSelected}</p>
                  </div>
                  <div className="card">
                    <strong>Enviables</strong>
                    <p className="muted">{validationSummary.validCount}</p>
                  </div>
                  <div className="card">
                    <strong>Bloqueadas</strong>
                    <p className="muted">{validationSummary.blockedCount}</p>
                  </div>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Empleado</th>
                        <th>Estado</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validationSummary.results.map((item) => (
                        <tr key={item.payrollId}>
                          <td>
                            <strong>{item.fullName}</strong>
                            <div className="muted">{item.employeeCode}</div>
                          </td>
                          <td>{item.status === "valid" ? "Valida" : "Bloqueada"}</td>
                          <td>{formatDispatchReason(item.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {dispatchResults.length > 0 ? (
              <div className="stack">
                <h3 className="section-subtitle">Ultimo envio</h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Empleado</th>
                        <th>Estado</th>
                        <th>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dispatchResults.map((item) => (
                        <tr key={`${item.employeeCode}-${item.status}`}>
                          <td>
                            <strong>{item.fullName}</strong>
                            <div className="muted">{item.employeeCode}</div>
                          </td>
                          <td>{item.status === "sent" ? "Enviado" : "Omitido"}</td>
                          <td>{formatDispatchReason(item.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </section>

          <form className="card stack" onSubmit={onUploadDocument}>
            <div>
              <h2 className="section-title">Documentos de RRHH</h2>
              <p className="section-subtitle">
                Solo se muestran categorias visibles para RRHH.
              </p>
            </div>

            <div className="field">
              <label>Titulo</label>
              <input
                className="input"
                value={documentForm.title}
                onChange={(event) =>
                  setDocumentForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Categoria</label>
              <select
                className="select"
                value={documentForm.category}
                onChange={(event) =>
                  setDocumentForm((current) => ({ ...current, category: event.target.value }))
                }
              >
                <option value="rrhh">RRHH</option>
                <option value="politica">Politica</option>
                <option value="empresa">Empresa</option>
              </select>
            </div>
            <div className="field">
              <label>Descripcion</label>
              <textarea
                className="textarea"
                value={documentForm.description}
                onChange={(event) =>
                  setDocumentForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={documentForm.useForAi}
                onChange={(event) =>
                  setDocumentForm((current) => ({
                    ...current,
                    useForAi: event.target.checked
                  }))
                }
              />
              <span>Permitir uso de este documento como contexto para la IA</span>
            </label>
            <input
              id="rrhh-document-file"
              className="input"
              type="file"
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            />
            <div className="actions">
              <button className="button" type="submit">
                Subir documento RRHH
              </button>
            </div>
          </form>
        </div>

        <section className="card">
          <h2 className="section-title">Biblioteca minima de RRHH</h2>
          <p className="section-subtitle">Documentos disponibles para consulta y descarga.</p>
          {documents.length === 0 ? (
            <div className="empty">Todavia no hay documentos de RRHH.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Titulo</th>
                    <th>Categoria</th>
                    <th>IA</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td>
                        <a
                          href={`${API_BASE_URL}/settings/documents/${document.id}/download`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {document.title}
                        </a>
                        <div className="muted">{document.description ?? "-"}</div>
                      </td>
                      <td>{document.category}</td>
                      <td>{document.useForAi ? "Si" : "No"}</td>
                      <td>{new Date(document.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
