"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, API_BASE_URL, AuthExpiredError } from "../../lib/api";
import { AppNav } from "../../components/app-nav";

type DriverRoute = {
  id: string;
  vehicleLabel: string;
  status: string;
  startedAt: string;
  closedAt?: string | null;
  startOdometer?: number | null;
  endOdometer?: number | null;
  driver?: {
    fullName: string;
    employeeCode: string;
  };
  invoices?: Array<{ id: string; invoiceNumber: string }>;
};

type WarehousePicking = {
  id: string;
  orderRef: string;
  routeRef?: string | null;
  vehicleLabel?: string | null;
  pickedAt: string;
  worker?: {
    fullName: string;
    employeeCode: string;
  };
};

type TruckLoading = {
  id: string;
  vehicleLabel: string;
  boxCount?: number | null;
  weightKg?: number | null;
  loadedAt: string;
  worker?: {
    fullName: string;
    employeeCode: string;
  };
};

type Incident = {
  id: string;
  sourceType: string;
  incidentType: string;
  severity: string;
  status: string;
  description: string;
  createdAt: string;
  reportedBy?: {
    fullName?: string;
    employeeCode?: string;
  } | null;
};

type TenantDocument = {
  id: string;
  category: string;
  title: string;
  description?: string | null;
  createdAt: string;
  useForAi?: boolean;
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
};

type ContactPersonOption = {
  id: string;
  fullName: string;
  alias?: string | null;
};

type CommercialAccountOption = {
  id: string;
  name: string;
  people: ContactPersonOption[];
};

type WorkItemNote = {
  id: string;
  type: string;
  title?: string | null;
  content: string;
  summary?: string | null;
  confidence?: number | null;
  createdAt: string;
  accountId?: string | null;
  contactPersonId?: string | null;
};

type WorkItemEvent = {
  id: string;
  eventType: string;
  details?: string | null;
  createdAt: string;
  actor?: {
    fullName?: string | null;
  } | null;
};

type WorkItem = {
  id: string;
  workType: string;
  status: string;
  title: string;
  summary?: string | null;
  targetAt?: string | null;
  deliveryMessage?: string | null;
  metadataJson?: Record<string, unknown> | null;
  account?: {
    id: string;
    name: string;
  } | null;
  contactPerson?: {
    id: string;
    fullName: string;
  } | null;
  assignedUser?: {
    id: string;
    fullName: string;
    employeeCode: string;
  } | null;
  notes?: WorkItemNote[];
  events?: WorkItemEvent[];
};

type WorkContextOptions = {
  employees: EmployeeItem[];
  accounts: CommercialAccountOption[];
};

type Overview = {
  companyName: string;
  businessProfile: string;
  companyDescription?: string;
  companyTimezone?: string;
  operationalHours?: string;
  responsibleName?: string;
  responsibleEmail?: string;
  metrics: {
    routesCount: number;
    pickingsCount: number;
    openIncidents: number;
    highSeverityIncidents: number;
    documentCount: number;
  };
};

type ManagerConfig = {
  companyName?: string;
  businessProfile: string;
  companyDescription?: string;
  companyTimezone?: string;
  operationalHours?: string;
  responsibleName?: string;
  responsibleEmail?: string;
};

type TemporaryPinState = {
  employeeCode: string;
  fullName: string;
  temporaryPin: string;
};

const defaultConfig: ManagerConfig = {
  companyName: "",
  businessProfile: "logistics",
  companyDescription: "",
  companyTimezone: "",
  operationalHours: "",
  responsibleName: "",
  responsibleEmail: ""
};

const defaultEmployeeForm = {
  employeeCode: "",
  fullName: "",
  email: "",
  phone: "",
  roles: ["chofer"]
};

const defaultDocumentForm = {
  area: "manager",
  category: "operacion",
  title: "",
  description: "",
  useForAi: false
};

const defaultEditEmployeeForm = {
  fullName: "",
  email: "",
  phone: "",
  roles: ["chofer"],
  status: "ACTIVE"
};

const defaultWorkItemForm = {
  workType: "route",
  title: "",
  summary: "",
  accountId: "",
  contactPersonId: "",
  assignedUserId: "",
  targetAt: "",
  deliveryChannel: "telegram"
};

const defaultNoteForm = {
  title: "",
  content: ""
};

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.message === "string") return data.message;
    if (Array.isArray(data?.message) && data.message.length > 0) {
      return data.message.join(". ");
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export default function ManagerPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [config, setConfig] = useState<ManagerConfig>(defaultConfig);
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [pickings, setPickings] = useState<WarehousePicking[]>([]);
  const [loadings, setLoadings] = useState<TruckLoading[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [documents, setDocuments] = useState<TenantDocument[]>([]);
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [workOptions, setWorkOptions] = useState<WorkContextOptions>({
    employees: [],
    accounts: []
  });
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(null);
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItem | null>(null);
  const [documentForm, setDocumentForm] = useState(defaultDocumentForm);
  const [employeeForm, setEmployeeForm] = useState(defaultEmployeeForm);
  const [workItemForm, setWorkItemForm] = useState(defaultWorkItemForm);
  const [noteForm, setNoteForm] = useState(defaultNoteForm);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editEmployeeForm, setEditEmployeeForm] = useState(defaultEditEmployeeForm);
  const [lastTemporaryPin, setLastTemporaryPin] = useState<TemporaryPinState | null>(null);
  const [incidentComments, setIncidentComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Manager puede operar, gestionar empleados e incidencias.");
  const [status, setStatus] = useState<"info" | "success" | "error">("info");
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingEmployee, setIsCreatingEmployee] = useState(false);
  const [isCreatingWorkItem, setIsCreatingWorkItem] = useState(false);
  const [isAssigningWorkItem, setIsAssigningWorkItem] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [promotingNoteId, setPromotingNoteId] = useState<string | null>(null);
  const [isUpdatingEmployee, setIsUpdatingEmployee] = useState(false);
  const [resettingPinId, setResettingPinId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    routeEmployeeCode: "",
    incidentSeverity: "",
    incidentSourceType: ""
  });

  async function loadData() {
    const [
      overviewResponse,
      configResponse,
      routesResponse,
      pickingsResponse,
      loadingsResponse,
      incidentsResponse,
      documentsResponse,
      employeesResponse,
      workItemsResponse,
      workOptionsResponse
    ] = await Promise.all([
      apiFetch("/manager/overview"),
      apiFetch("/manager/config"),
      apiFetch(
        `/manager/driver-routes${
          filters.routeEmployeeCode
            ? `?employeeCode=${encodeURIComponent(filters.routeEmployeeCode)}`
            : ""
        }`
      ),
      apiFetch("/manager/warehouse-pickings"),
      apiFetch("/manager/truck-loadings"),
      apiFetch(
        `/manager/incidents?${
          new URLSearchParams(
            Object.entries({
              severity: filters.incidentSeverity,
              sourceType: filters.incidentSourceType
            }).filter(([, value]) => value)
          ).toString()
        }`
      ),
      apiFetch("/settings/documents?area=manager"),
      apiFetch("/hr/employees"),
      apiFetch("/work-items"),
      apiFetch("/work-items/context/options")
    ]);

    const responses = [
      overviewResponse,
      configResponse,
      routesResponse,
      pickingsResponse,
      loadingsResponse,
      incidentsResponse,
      documentsResponse,
      employeesResponse,
      workItemsResponse,
      workOptionsResponse
    ];

    if (responses.some((response) => response.status === 403)) {
      throw new Error("forbidden");
    }

    if (responses.some((response) => !response.ok)) {
      throw new Error("No se pudo cargar el panel manager.");
    }

    const [
      overviewData,
      configData,
      routesData,
      pickingsData,
      loadingsData,
      incidentsData,
      documentsData,
      employeesData,
      workItemsData,
      workOptionsData
    ] = await Promise.all(responses.map((response) => response.json()));

    setOverview(overviewData);
    setConfig({
      ...defaultConfig,
      ...configData
    });
    setRoutes(routesData);
    setPickings(pickingsData);
    setLoadings(loadingsData);
    setIncidents(incidentsData);
    setDocuments(documentsData);
    setEmployees(employeesData);
    setWorkItems(workItemsData);
    setWorkOptions(workOptionsData);
    if (workItemsData.length === 0) {
      setSelectedWorkItemId(null);
      setSelectedWorkItem(null);
    } else if (!selectedWorkItemId || !workItemsData.some((item: WorkItem) => item.id === selectedWorkItemId)) {
      setSelectedWorkItemId(workItemsData[0].id);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        await loadData();
      } catch (error) {
        if (error instanceof AuthExpiredError) {
          window.location.href = "/";
          return;
        }

        if (error instanceof Error && error.message === "forbidden") {
          setStatus("error");
          setMessage("Tu sesion no tiene acceso al panel manager. Entra con un usuario manager o admin.");
          return;
        }

        setStatus("error");
        setMessage("No se pudo cargar el panel manager. Revisa la sesion o el backend local.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [filters]);

  const openIncidents = useMemo(
    () => incidents.filter((incident) => incident.status === "open").length,
    [incidents]
  );

  const closedRoutes = useMemo(
    () => routes.filter((route) => route.status === "closed").length,
    [routes]
  );

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === editingEmployeeId) ?? null,
    [editingEmployeeId, employees]
  );

  const selectedAccount = useMemo(
    () => workOptions.accounts.find((account) => account.id === workItemForm.accountId) ?? null,
    [workItemForm.accountId, workOptions.accounts]
  );

  useEffect(() => {
    async function loadWorkItemDetail() {
      if (!selectedWorkItemId) {
        setSelectedWorkItem(null);
        return;
      }

      try {
        const response = await apiFetch(`/work-items/${selectedWorkItemId}`);
        if (!response.ok) {
          throw new Error("No se pudo cargar el detalle del trabajo.");
        }
        setSelectedWorkItem(await response.json());
      } catch {
        setSelectedWorkItem(null);
      }
    }

    void loadWorkItemDetail();
  }, [selectedWorkItemId]);

  useEffect(() => {
    if (!selectedWorkItem) {
      return;
    }

    setWorkItemForm((current) => ({
      ...current,
      title: selectedWorkItem.title,
      summary: selectedWorkItem.summary ?? "",
      accountId: selectedWorkItem.account?.id ?? "",
      contactPersonId: selectedWorkItem.contactPerson?.id ?? "",
      assignedUserId: selectedWorkItem.assignedUser?.id ?? "",
      targetAt: selectedWorkItem.targetAt
        ? new Date(selectedWorkItem.targetAt).toISOString().slice(0, 16)
        : "",
      deliveryChannel: current.deliveryChannel || "telegram"
    }));
  }, [selectedWorkItem]);

  function startEditEmployee(employee: EmployeeItem) {
    setEditingEmployeeId(employee.id);
    setEditEmployeeForm({
      fullName: employee.fullName,
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      roles: employee.roles.length > 0 ? employee.roles : ["chofer"],
      status: employee.status
    });
  }

  function resetEditEmployee() {
    setEditingEmployeeId(null);
    setEditEmployeeForm(defaultEditEmployeeForm);
  }

  async function onSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingConfig(true);
    setStatus("info");
    setMessage("Guardando configuracion operativa...");

    try {
      const response = await apiFetch("/manager/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo guardar la configuracion."));
      }

      setStatus("success");
      setMessage("Configuracion operativa actualizada.");
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la configuracion.");
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function onUploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = document.getElementById("manager-document-file") as HTMLInputElement;
    if (!input.files?.[0]) {
      setStatus("error");
      setMessage("Selecciona un documento operativo.");
      return;
    }

    setIsUploading(true);
    setStatus("info");
    setMessage("Subiendo documento operativo...");

    try {
      const form = new FormData();
      form.append("area", documentForm.area);
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
      setMessage("Documento operativo subido.");
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo subir el documento.");
    } finally {
      setIsUploading(false);
    }
  }

  async function onCreateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingEmployee(true);
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
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo crear el empleado.");
    } finally {
      setIsCreatingEmployee(false);
    }
  }

  async function onUpdateEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEmployee) {
      return;
    }

    setIsUpdatingEmployee(true);
    setStatus("info");
    setMessage("Guardando cambios del empleado...");

    try {
      const response = await apiFetch(`/hr/employees/${selectedEmployee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editEmployeeForm.fullName,
          email: editEmployeeForm.email || null,
          phone: editEmployeeForm.phone || null,
          roles: editEmployeeForm.roles,
          status: editEmployeeForm.status
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo actualizar el empleado."));
      }

      setStatus("success");
      setMessage("Empleado actualizado.");
      resetEditEmployee();
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el empleado.");
    } finally {
      setIsUpdatingEmployee(false);
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
        throw new Error(await readErrorMessage(response, "No se pudo actualizar el empleado."));
      }

      setStatus("success");
      setMessage("Estado del empleado actualizado.");
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar el empleado.");
    }
  }

  async function onResetPin(employee: EmployeeItem) {
    setResettingPinId(employee.id);
    setStatus("info");
    setMessage(`Generando PIN temporal para ${employee.employeeCode}...`);

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
      setResettingPinId(null);
    }
  }

  async function onCloseIncident(incidentId: string) {
    setStatus("info");
    setMessage("Cerrando incidencia...");

    try {
      const response = await apiFetch(`/manager/incidents/${incidentId}/close`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: incidentComments[incidentId]?.trim() || undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo cerrar la incidencia."));
      }

      setIncidentComments((current) => ({ ...current, [incidentId]: "" }));
      setStatus("success");
      setMessage("Incidencia cerrada.");
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo cerrar la incidencia.");
    }
  }

  async function onCreateWorkItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingWorkItem(true);
    setStatus("info");
    setMessage("Creando trabajo asignable...");

    try {
      const response = await apiFetch("/work-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workType: workItemForm.workType,
          title: workItemForm.title,
          summary: workItemForm.summary || undefined,
          accountId: workItemForm.accountId || undefined,
          contactPersonId: workItemForm.contactPersonId || undefined,
          assignedUserId: workItemForm.assignedUserId || undefined,
          targetAt: workItemForm.targetAt || undefined,
          deliveryChannel: workItemForm.deliveryChannel || undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo crear el trabajo."));
      }

      const created = await response.json();
      setWorkItemForm(defaultWorkItemForm);
      setSelectedWorkItemId(created.id);
      setStatus("success");
      setMessage("Trabajo creado.");
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo crear el trabajo.");
    } finally {
      setIsCreatingWorkItem(false);
    }
  }

  async function onAssignSelectedWorkItem() {
    if (!selectedWorkItem || !workItemForm.assignedUserId) {
      setStatus("error");
      setMessage("Selecciona un trabajo y un empleado para asignar.");
      return;
    }

    setIsAssigningWorkItem(true);
    setStatus("info");
    setMessage("Asignando trabajo...");

    try {
      const response = await apiFetch(`/work-items/${selectedWorkItem.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedUserId: workItemForm.assignedUserId,
          targetAt: workItemForm.targetAt || undefined,
          summary: workItemForm.summary || undefined,
          deliveryChannel: workItemForm.deliveryChannel || undefined
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo asignar el trabajo."));
      }

      setSelectedWorkItem(await response.json());
      setStatus("success");
      setMessage("Trabajo asignado.");
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo asignar el trabajo.");
    } finally {
      setIsAssigningWorkItem(false);
    }
  }

  async function onAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedWorkItem) {
      setStatus("error");
      setMessage("Selecciona un trabajo antes de anadir notas.");
      return;
    }

    setIsAddingNote(true);
    setStatus("info");
    setMessage("Guardando nota operativa...");

    try {
      const response = await apiFetch(`/work-items/${selectedWorkItem.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteForm)
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo guardar la nota."));
      }

      setSelectedWorkItem(await response.json());
      setNoteForm(defaultNoteForm);
      setStatus("success");
      setMessage("Nota operativa guardada.");
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo guardar la nota.");
    } finally {
      setIsAddingNote(false);
    }
  }

  async function onPromoteNote(noteId: string, target: "work_item" | "account" | "person") {
    if (!selectedWorkItem) {
      return;
    }

    setPromotingNoteId(noteId);
    setStatus("info");
    setMessage("Promoviendo nota a memoria util...");

    try {
      const response = await apiFetch(`/work-items/${selectedWorkItem.id}/notes/${noteId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo promover la nota."));
      }

      setSelectedWorkItem(await response.json());
      setStatus("success");
      setMessage("Nota promovida.");
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo promover la nota.");
    } finally {
      setPromotingNoteId(null);
    }
  }

  return (
    <main className="shell">
      <AppNav
        title="Panel Manager"
        subtitle="Operacion, responsables, incidencias, documentos y empleados."
      />

      <section className="card hero-card">
        <div className="row">
          <div>
            <h2 className="section-title">{overview?.companyName ?? "Panel operativo"}</h2>
            <p>
              {overview?.companyDescription ||
                "Vista local de reportes operativos, configuracion basica y seguimiento de incidencias."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-3" style={{ marginTop: 20 }}>
        <div className="card metric">
          <span className="metric-label">Rutas registradas</span>
          <span className="metric-value">{overview?.metrics.routesCount ?? routes.length}</span>
          <span className="metric-note">{closedRoutes} cerradas</span>
        </div>
        <div className="card metric">
          <span className="metric-label">Pickings reportados</span>
          <span className="metric-value">{overview?.metrics.pickingsCount ?? pickings.length}</span>
          <span className="metric-note">Operacion de almacen en curso</span>
        </div>
        <div className="card metric">
          <span className="metric-label">Incidencias prioritarias</span>
          <span className="metric-value">{overview?.metrics.highSeverityIncidents ?? 0}</span>
          <span className="metric-note">{openIncidents} abiertas</span>
        </div>
      </section>

      <section className="stack" style={{ marginTop: 20 }}>
        {loading ? <div className="status info">Cargando datos del panel...</div> : null}
        <div className={`status ${status}`}>{message}</div>

        {lastTemporaryPin ? (
          <section className="card">
            <h2 className="section-title">PIN temporal generado</h2>
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
          <form className="card stack" onSubmit={onCreateWorkItem}>
            <div>
              <h2 className="section-title">Trabajo asignable</h2>
              <p className="section-subtitle">
                Base comun para ruta, pedido, cita, visita o tarea.
              </p>
            </div>

            <div className="split">
              <div className="field">
                <label>Tipo</label>
                <select
                  className="select"
                  value={workItemForm.workType}
                  onChange={(event) =>
                    setWorkItemForm((current) => ({ ...current, workType: event.target.value }))
                  }
                >
                  <option value="route">Ruta</option>
                  <option value="order">Pedido</option>
                  <option value="appointment">Cita</option>
                  <option value="visit">Visita</option>
                  <option value="task">Tarea</option>
                </select>
              </div>
              <div className="field">
                <label>Fecha objetivo</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={workItemForm.targetAt}
                  onChange={(event) =>
                    setWorkItemForm((current) => ({ ...current, targetAt: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="field">
              <label>Titulo</label>
              <input
                className="input"
                value={workItemForm.title}
                onChange={(event) =>
                  setWorkItemForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>

            <div className="field">
              <label>Resumen</label>
              <textarea
                className="textarea"
                value={workItemForm.summary}
                onChange={(event) =>
                  setWorkItemForm((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </div>

            <div className="split">
              <div className="field">
                <label>Cuenta comercial</label>
                <select
                  className="select"
                  value={workItemForm.accountId}
                  onChange={(event) =>
                    setWorkItemForm((current) => ({
                      ...current,
                      accountId: event.target.value,
                      contactPersonId: ""
                    }))
                  }
                >
                  <option value="">Sin cuenta</option>
                  {workOptions.accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Persona actual</label>
                <select
                  className="select"
                  value={workItemForm.contactPersonId}
                  onChange={(event) =>
                    setWorkItemForm((current) => ({
                      ...current,
                      contactPersonId: event.target.value
                    }))
                  }
                >
                  <option value="">Sin persona</option>
                  {(selectedAccount?.people ?? []).map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="split">
              <div className="field">
                <label>Empleado asignado</label>
                <select
                  className="select"
                  value={workItemForm.assignedUserId}
                  onChange={(event) =>
                    setWorkItemForm((current) => ({
                      ...current,
                      assignedUserId: event.target.value
                    }))
                  }
                >
                  <option value="">Sin asignar</option>
                  {workOptions.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.fullName} ({employee.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Canal preparado</label>
                <select
                  className="select"
                  value={workItemForm.deliveryChannel}
                  onChange={(event) =>
                    setWorkItemForm((current) => ({
                      ...current,
                      deliveryChannel: event.target.value
                    }))
                  }
                >
                  <option value="telegram">Telegram</option>
                  <option value="email">Email</option>
                </select>
              </div>
            </div>

            <div className="actions">
              <button className="button" type="submit" disabled={isCreatingWorkItem}>
                {isCreatingWorkItem ? "Creando..." : "Crear trabajo"}
              </button>
            </div>
          </form>

          <section className="card stack">
            <div>
              <h2 className="section-title">Detalle del trabajo</h2>
              <p className="section-subtitle">
                Seleccion, reasignacion, notas operativas y memoria util.
              </p>
            </div>

            {!selectedWorkItem ? (
              <div className="empty">Selecciona un trabajo para ver el detalle.</div>
            ) : (
              <>
                <div className="card">
                  <strong>{selectedWorkItem.title}</strong>
                  <div className="muted">{selectedWorkItem.summary ?? "Sin resumen"}</div>
                  <div className="muted">
                    {selectedWorkItem.account?.name ?? "Sin cuenta"} ·{" "}
                    {selectedWorkItem.contactPerson?.fullName ?? "Sin persona"} ·{" "}
                    {selectedWorkItem.assignedUser?.fullName ?? "Sin asignar"}
                  </div>
                </div>

                <div className="field">
                  <label>Mensaje listo para entregar</label>
                  <textarea
                    className="textarea"
                    value={selectedWorkItem.deliveryMessage ?? "Sin mensaje preparado"}
                    readOnly
                  />
                </div>

                <div className="split">
                  <div className="field">
                    <label>Reasignar a</label>
                    <select
                      className="select"
                      value={workItemForm.assignedUserId}
                      onChange={(event) =>
                        setWorkItemForm((current) => ({
                          ...current,
                          assignedUserId: event.target.value
                        }))
                      }
                    >
                      <option value="">Selecciona empleado</option>
                      {workOptions.employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName} ({employee.employeeCode})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Estado</label>
                    <input className="input" value={selectedWorkItem.status} readOnly />
                  </div>
                </div>

                <div className="actions">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isAssigningWorkItem}
                    onClick={() => void onAssignSelectedWorkItem()}
                  >
                    {isAssigningWorkItem ? "Asignando..." : "Asignar / reasignar"}
                  </button>
                </div>

                <form className="stack" onSubmit={onAddNote}>
                  <div className="field">
                    <label>Titulo de la nota</label>
                    <input
                      className="input"
                      value={noteForm.title}
                      onChange={(event) =>
                        setNoteForm((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Nota operativa</label>
                    <textarea
                      className="textarea"
                      value={noteForm.content}
                      onChange={(event) =>
                        setNoteForm((current) => ({ ...current, content: event.target.value }))
                      }
                    />
                  </div>
                  <div className="actions">
                    <button className="button" type="submit" disabled={isAddingNote}>
                      {isAddingNote ? "Guardando..." : "Anadir nota"}
                    </button>
                  </div>
                </form>

                <div className="grid grid-2">
                  <section className="card">
                    <h3 className="section-title">Notas</h3>
                    {selectedWorkItem.notes?.length ? (
                      <div className="stack">
                        {selectedWorkItem.notes.map((note) => (
                          <div key={note.id} className="card">
                            <strong>{note.title || note.summary || note.type}</strong>
                            <div className="muted">{note.content}</div>
                            <div className="muted">
                              {note.type}
                              {typeof note.confidence === "number"
                                ? ` · confianza ${Math.round(note.confidence * 100)}%`
                                : ""}
                            </div>
                            <div className="actions">
                              <button
                                className="button secondary"
                                type="button"
                                disabled={promotingNoteId === note.id}
                                onClick={() => void onPromoteNote(note.id, "work_item")}
                              >
                                Trabajo
                              </button>
                              <button
                                className="button secondary"
                                type="button"
                                disabled={promotingNoteId === note.id}
                                onClick={() => void onPromoteNote(note.id, "account")}
                              >
                                Cuenta
                              </button>
                              <button
                                className="button secondary"
                                type="button"
                                disabled={promotingNoteId === note.id}
                                onClick={() => void onPromoteNote(note.id, "person")}
                              >
                                Persona
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty">Sin notas operativas todavia.</div>
                    )}
                  </section>

                  <section className="card">
                    <h3 className="section-title">Historico</h3>
                    {selectedWorkItem.events?.length ? (
                      <div className="stack">
                        {selectedWorkItem.events.map((event) => (
                          <div key={event.id} className="card">
                            <strong>{event.eventType}</strong>
                            <div className="muted">{event.details ?? "-"}</div>
                            <div className="muted">
                              {new Date(event.createdAt).toLocaleString()}
                              {event.actor?.fullName ? ` · ${event.actor.fullName}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty">Sin historico todavia.</div>
                    )}
                  </section>
                </div>
              </>
            )}
          </section>
        </div>

        <section className="card">
          <div className="row">
            <div>
              <h2 className="section-title">Trabajos creados</h2>
              <p className="section-subtitle">
                Selecciona uno para revisar contexto, notas y reasignacion.
              </p>
            </div>
          </div>
          {workItems.length === 0 ? (
            <div className="empty">Todavia no hay trabajos creados.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Trabajo</th>
                    <th>Tipo</th>
                    <th>Asignado</th>
                    <th>Estado</th>
                    <th>Contexto</th>
                  </tr>
                </thead>
                <tbody>
                  {workItems.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedWorkItemId(item.id)}
                      style={{
                        cursor: "pointer",
                        backgroundColor:
                          selectedWorkItemId === item.id ? "rgba(255,255,255,0.04)" : undefined
                      }}
                    >
                      <td>
                        <strong>{item.title}</strong>
                        <div className="muted">{item.summary ?? "-"}</div>
                      </td>
                      <td>{item.workType}</td>
                      <td>
                        {item.assignedUser?.fullName ?? "Pendiente"}
                        <div className="muted">{item.assignedUser?.employeeCode ?? "-"}</div>
                      </td>
                      <td>
                        <span className={`pill ${item.status}`}>{item.status}</span>
                      </td>
                      <td>
                        {item.account?.name ?? "Sin cuenta"}
                        <div className="muted">{item.contactPerson?.fullName ?? "-"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid grid-2">
          <form onSubmit={onSaveConfig} className="card stack">
            <div>
              <h2 className="section-title">Configuracion operativa</h2>
              <p className="section-subtitle">
                Datos visibles de empresa, horario y responsable principal.
              </p>
            </div>

            <div className="split">
              <div className="field">
                <label>Nombre de la empresa</label>
                <input
                  className="input"
                  value={config.companyName ?? ""}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, companyName: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label>Perfil de negocio</label>
                <input className="input" value={config.businessProfile ?? ""} disabled />
              </div>
            </div>

            <div className="split">
              <div className="field">
                <label>Zona horaria</label>
                <input
                  className="input"
                  value={config.companyTimezone ?? ""}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, companyTimezone: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label>Horario operativo</label>
                <input
                  className="input"
                  value={config.operationalHours ?? ""}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, operationalHours: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="split">
              <div className="field">
                <label>Responsable principal</label>
                <input
                  className="input"
                  value={config.responsibleName ?? ""}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, responsibleName: event.target.value }))
                  }
                />
              </div>
              <div className="field">
                <label>Email responsable</label>
                <input
                  className="input"
                  value={config.responsibleEmail ?? ""}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, responsibleEmail: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="field">
              <label>Descripcion operativa</label>
              <textarea
                className="textarea"
                value={config.companyDescription ?? ""}
                onChange={(event) =>
                  setConfig((current) => ({ ...current, companyDescription: event.target.value }))
                }
              />
            </div>

            <div className="actions">
              <button className="button" type="submit" disabled={isSavingConfig}>
                {isSavingConfig ? "Guardando..." : "Guardar datos operativos"}
              </button>
            </div>
          </form>

          <section className="card stack">
            <div>
              <h2 className="section-title">Resumen de operacion</h2>
              <p className="section-subtitle">Contexto rapido del tenant para el responsable.</p>
            </div>

            <div className="grid grid-2">
              <div className="card">
                <strong>Horario</strong>
                <p className="muted">{overview?.operationalHours || "Sin definir"}</p>
              </div>
              <div className="card">
                <strong>Responsable</strong>
                <p className="muted">
                  {overview?.responsibleName || "Sin asignar"}
                  {overview?.responsibleEmail ? ` · ${overview.responsibleEmail}` : ""}
                </p>
              </div>
              <div className="card">
                <strong>Zona horaria</strong>
                <p className="muted">{overview?.companyTimezone || "Sin definir"}</p>
              </div>
              <div className="card">
                <strong>Documentos operativos</strong>
                <p className="muted">{overview?.metrics.documentCount ?? documents.length} cargados</p>
              </div>
            </div>
          </section>
        </div>

        <div className="grid grid-2">
          <form className="card stack" onSubmit={onCreateEmployee}>
            <div>
              <h2 className="section-title">Alta rapida de empleados</h2>
              <p className="section-subtitle">
                Manager puede crear y operar empleados, salvo perfiles admin.
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
              <button className="button" type="submit" disabled={isCreatingEmployee}>
                {isCreatingEmployee ? "Creando..." : "Crear empleado"}
              </button>
            </div>
          </form>

          <form className="card stack" onSubmit={onUploadDocument}>
            <div>
              <h2 className="section-title">Documentos operativos</h2>
              <p className="section-subtitle">
                Politicas, manuales, documentos de empresa y operacion.
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
                <option value="operacion">Operacion</option>
                <option value="manual">Manual</option>
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
              <span>Permitir uso como contexto para IA</span>
            </label>
            <input
              id="manager-document-file"
              className="input"
              type="file"
              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            />
            <div className="actions">
              <button className="button" type="submit" disabled={isUploading}>
                {isUploading ? "Subiendo..." : "Subir documento"}
              </button>
            </div>
          </form>
        </div>

        <section className="card">
          <div className="row">
            <div>
              <h2 className="section-title">Empleados operativos</h2>
              <p className="section-subtitle">Creacion, mantenimiento y reinicio de PIN.</p>
            </div>
          </div>
          {employees.length === 0 ? (
            <div className="empty">Todavia no hay empleados registrados.</div>
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
                            disabled={resettingPinId === employee.id}
                            onClick={() => void onResetPin(employee)}
                          >
                            {resettingPinId === employee.id ? "Generando..." : "Reset PIN"}
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

        <form className="card stack" onSubmit={onUpdateEmployee}>
          <div>
            <h2 className="section-title">Editar empleado</h2>
            <p className="section-subtitle">
              Ajusta datos, rol y estado desde manager sin tocar usuarios admin.
            </p>
          </div>

          {!selectedEmployee ? (
            <div className="empty">Selecciona un empleado de la tabla para editarlo.</div>
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
                  value={editEmployeeForm.fullName}
                  onChange={(event) =>
                    setEditEmployeeForm((current) => ({
                      ...current,
                      fullName: event.target.value
                    }))
                  }
                />
              </div>
              <div className="split">
                <div className="field">
                  <label>Email</label>
                  <input
                    className="input"
                    value={editEmployeeForm.email}
                    onChange={(event) =>
                      setEditEmployeeForm((current) => ({
                        ...current,
                        email: event.target.value
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label>Telefono</label>
                  <input
                    className="input"
                    value={editEmployeeForm.phone}
                    onChange={(event) =>
                      setEditEmployeeForm((current) => ({
                        ...current,
                        phone: event.target.value
                      }))
                    }
                  />
                </div>
              </div>
              <div className="split">
                <div className="field">
                  <label>Rol principal</label>
                  <select
                    className="select"
                    value={editEmployeeForm.roles[0]}
                    onChange={(event) =>
                      setEditEmployeeForm((current) => ({
                        ...current,
                        roles: [event.target.value]
                      }))
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
                    value={editEmployeeForm.status}
                    onChange={(event) =>
                      setEditEmployeeForm((current) => ({
                        ...current,
                        status: event.target.value
                      }))
                    }
                  >
                    <option value="ACTIVE">Activo</option>
                    <option value="INACTIVE">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="actions">
                <button className="button" type="submit" disabled={isUpdatingEmployee}>
                  {isUpdatingEmployee ? "Guardando..." : "Guardar cambios"}
                </button>
                <button className="button secondary" type="button" onClick={resetEditEmployee}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </form>

        <div className="card">
          <div className="row">
            <div>
              <h2 className="section-title">Rutas de choferes</h2>
              <p className="section-subtitle">Camion, kilometraje y facturas reportadas.</p>
            </div>
            <div className="field" style={{ minWidth: 220 }}>
              <label>Filtrar por codigo de chofer</label>
              <input
                className="input"
                value={filters.routeEmployeeCode}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    routeEmployeeCode: event.target.value.toUpperCase()
                  }))
                }
                placeholder="Ej. DRV001"
              />
            </div>
          </div>
          {routes.length === 0 ? (
            <div className="empty">Todavia no hay rutas registradas.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Chofer</th>
                    <th>Camion</th>
                    <th>Estado</th>
                    <th>Km salida</th>
                    <th>Km regreso</th>
                    <th>Facturas</th>
                    <th>Inicio</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((route) => (
                    <tr key={route.id}>
                      <td>
                        <strong>{route.driver?.fullName ?? "Sin nombre"}</strong>
                        <div className="muted">{route.driver?.employeeCode}</div>
                      </td>
                      <td>{route.vehicleLabel}</td>
                      <td>
                        <span className={`pill ${route.status}`}>{route.status}</span>
                      </td>
                      <td>{route.startOdometer ?? "-"}</td>
                      <td>{route.endOdometer ?? "-"}</td>
                      <td>{route.invoices?.map((invoice) => invoice.invoiceNumber).join(", ") || "-"}</td>
                      <td>{new Date(route.startedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-2">
          <section className="card">
            <h2 className="section-title">Pickings</h2>
            <p className="section-subtitle">Vista compacta de reportes de almacen.</p>
            {pickings.length === 0 ? (
              <div className="empty">Todavia no hay pickings reportados.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Pedido</th>
                      <th>Ruta</th>
                      <th>Camion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickings.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.worker?.fullName ?? "Sin nombre"}</strong>
                          <div className="muted">{item.worker?.employeeCode}</div>
                        </td>
                        <td>{item.orderRef}</td>
                        <td>{item.routeRef ?? "-"}</td>
                        <td>{item.vehicleLabel ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="section-title">Cargas de camion</h2>
            <p className="section-subtitle">Resumen basico de cajas y peso.</p>
            {loadings.length === 0 ? (
              <div className="empty">Todavia no hay cargas reportadas.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Empleado</th>
                      <th>Camion</th>
                      <th>Cajas</th>
                      <th>Peso kg</th>
                      <th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadings.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.worker?.fullName ?? "Sin nombre"}</strong>
                          <div className="muted">{item.worker?.employeeCode}</div>
                        </td>
                        <td>{item.vehicleLabel}</td>
                        <td>{item.boxCount ?? "-"}</td>
                        <td>{item.weightKg ?? "-"}</td>
                        <td>{new Date(item.loadedAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <section className="card stack">
          <div className="row">
            <div>
              <h2 className="section-title">Incidencias</h2>
              <p className="section-subtitle">Filtro por severidad/origen y cierre con comentario opcional.</p>
            </div>
          </div>
          <div className="split">
            <div className="field">
              <label>Severidad</label>
              <select
                className="select"
                value={filters.incidentSeverity}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    incidentSeverity: event.target.value
                  }))
                }
              >
                <option value="">Todas</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="field">
              <label>Origen</label>
              <select
                className="select"
                value={filters.incidentSourceType}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    incidentSourceType: event.target.value
                  }))
                }
              >
                <option value="">Todos</option>
                <option value="driver">Driver</option>
                <option value="warehouse">Warehouse</option>
              </select>
            </div>
          </div>

          {incidents.length === 0 ? (
            <div className="empty">No hay incidencias para los filtros actuales.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Origen</th>
                    <th>Tipo</th>
                    <th>Severidad</th>
                    <th>Detalle</th>
                    <th>Cierre</th>
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((incident) => (
                    <tr key={incident.id}>
                      <td>
                        <strong>{incident.reportedBy?.fullName ?? "Sin nombre"}</strong>
                        <div className="muted">
                          {incident.sourceType} · {incident.reportedBy?.employeeCode ?? "-"}
                        </div>
                      </td>
                      <td>{incident.incidentType}</td>
                      <td>
                        <span className={`pill ${incident.severity}`}>{incident.severity}</span>
                      </td>
                      <td>
                        {incident.description}
                        <div className="muted">{new Date(incident.createdAt).toLocaleString()}</div>
                      </td>
                      <td>
                        {incident.status === "closed" ? (
                          <span className="muted">Cerrada</span>
                        ) : (
                          <div className="stack">
                            <textarea
                              className="textarea"
                              placeholder="Comentario opcional de cierre"
                              value={incidentComments[incident.id] ?? ""}
                              onChange={(event) =>
                                setIncidentComments((current) => ({
                                  ...current,
                                  [incident.id]: event.target.value
                                }))
                              }
                            />
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => void onCloseIncident(incident.id)}
                            >
                              Cerrar incidencia
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Biblioteca operativa</h2>
          <p className="section-subtitle">Documentos visibles para manager.</p>
          {documents.length === 0 ? (
            <div className="empty">Todavia no hay documentos operativos.</div>
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
