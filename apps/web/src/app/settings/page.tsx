"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, API_BASE_URL, AuthExpiredError } from "../../lib/api";
import { AppNav } from "../../components/app-nav";

type TenantSettings = {
  companyName?: string | null;
  businessProfile: string;
  companyDescription?: string | null;
  companyTimezone?: string | null;
  operationalHours?: string | null;
  responsibleName?: string | null;
  responsibleEmail?: string | null;
  telegramEnabled: boolean;
  telegramBotToken?: string | null;
  emailProvider?: string | null;
  outboundEmailFrom?: string | null;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  aiApiKey?: string | null;
  assistantInstructions?: string | null;
  operationalInstructions?: string | null;
  hrInstructions?: string | null;
  integrationNotes?: string | null;
};

type TenantDocument = {
  id: string;
  area: string;
  category: string;
  title: string;
  description?: string | null;
  createdAt: string;
  useForAi?: boolean;
  uploadedBy?: { fullName?: string };
};

const defaultSettings: TenantSettings = {
  businessProfile: "logistics",
  telegramEnabled: true
};

const defaultDocumentForm = {
  area: "manager",
  category: "operacion",
  title: "",
  description: "",
  useForAi: false
};

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

export default function SettingsPage() {
  const [settings, setSettings] = useState<TenantSettings>(defaultSettings);
  const [documents, setDocuments] = useState<TenantDocument[]>([]);
  const [message, setMessage] = useState(
    "Carga la configuracion minima del tenant y las instrucciones de IA."
  );
  const [status, setStatus] = useState<"info" | "success" | "error">("info");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [documentForm, setDocumentForm] = useState(defaultDocumentForm);

  async function loadData() {
    const [settingsResponse, documentsResponse] = await Promise.all([
      apiFetch("/settings"),
      apiFetch("/settings/documents")
    ]);

    if (settingsResponse.status === 403) {
      throw new Error("forbidden");
    }

    if (!settingsResponse.ok || !documentsResponse.ok) {
      throw new Error("No se pudo cargar la configuracion.");
    }

    const [settingsData, documentsData] = await Promise.all([
      settingsResponse.json(),
      documentsResponse.json()
    ]);

    setSettings({
      ...defaultSettings,
      ...settingsData
    });
    setDocuments(documentsData);
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
            "Tu sesion no tiene acceso al panel de configuracion. Entra con un usuario admin."
          );
          return;
        }
        setStatus("error");
        setMessage("No se pudo cargar la configuracion del tenant.");
      } finally {
        setIsLoading(false);
      }
    }

    void run();
  }, []);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setStatus("info");
    setMessage("Guardando configuracion...");

    try {
      const response = await apiFetch("/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          smtpPort: settings.smtpPort ? Number(settings.smtpPort) : null
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "No se pudo guardar la configuracion."));
      }

      const updated = await response.json();
      setSettings({
        ...defaultSettings,
        ...updated
      });
      setStatus("success");
      setMessage("Configuracion guardada.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "No se pudo guardar la configuracion."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function onUploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = document.getElementById("settings-document-file") as HTMLInputElement;
    if (!input.files?.[0]) {
      setStatus("error");
      setMessage("Selecciona un PDF o documento antes de subirlo.");
      return;
    }

    setIsUploading(true);
    setStatus("info");
    setMessage("Subiendo documento...");

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

      setStatus("success");
      setMessage("Documento subido.");
      setDocumentForm(defaultDocumentForm);
      input.value = "";
      await loadData();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo subir el documento.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="shell">
      <AppNav
        title="Configuracion"
        subtitle="Tenant, instrucciones de IA, correo, Telegram y documentos base."
      />

      <section className="card hero-card">
        <h2 className="section-title">Configuracion minima del tenant</h2>
        <p>
          Aqui se define el perfil de negocio, los datos de empresa, Telegram, correo y el
          comportamiento base del asistente.
        </p>
      </section>

      <section className="stack" style={{ marginTop: 20 }}>
        {isLoading ? <div className="status info">Cargando configuracion...</div> : null}
        <div className={`status ${status}`}>{message}</div>

        <form className="card stack" onSubmit={onSave}>
          <div>
            <h2 className="section-title">Empresa y operacion</h2>
            <p className="section-subtitle">Perfil base, responsables y datos generales.</p>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label>Nombre de la empresa</label>
              <input
                className="input"
                value={settings.companyName ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, companyName: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Perfil de negocio</label>
              <select
                className="select"
                value={settings.businessProfile}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, businessProfile: event.target.value }))
                }
              >
                <option value="logistics">Logistica</option>
                <option value="beauty_salon">Salon de belleza</option>
                <option value="generic_service">Servicio general</option>
              </select>
            </div>
            <div className="field">
              <label>Zona horaria</label>
              <input
                className="input"
                value={settings.companyTimezone ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, companyTimezone: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Horario operativo</label>
              <input
                className="input"
                value={settings.operationalHours ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, operationalHours: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Responsable principal</label>
              <input
                className="input"
                value={settings.responsibleName ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, responsibleName: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Email responsable</label>
              <input
                className="input"
                value={settings.responsibleEmail ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, responsibleEmail: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="field">
            <label>Descripcion de la empresa</label>
            <textarea
              className="textarea"
              value={settings.companyDescription ?? ""}
              onChange={(event) =>
                setSettings((current) => ({ ...current, companyDescription: event.target.value }))
              }
            />
          </div>

          <div>
            <h2 className="section-title">Canales y correo</h2>
            <p className="section-subtitle">
              Telegram activo hoy. El correo queda preparado para alertas y asistencia futura.
            </p>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label>Canal Telegram activo</label>
              <select
                className="select"
                value={settings.telegramEnabled ? "true" : "false"}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    telegramEnabled: event.target.value === "true"
                  }))
                }
              >
                <option value="true">Si</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="field">
              <label>Token de Telegram</label>
              <input
                className="input"
                value={settings.telegramBotToken ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, telegramBotToken: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Proveedor de correo</label>
              <input
                className="input"
                value={settings.emailProvider ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, emailProvider: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Correo remitente</label>
              <input
                className="input"
                value={settings.outboundEmailFrom ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    outboundEmailFrom: event.target.value
                  }))
                }
              />
            </div>
            <div className="field">
              <label>SMTP Host</label>
              <input
                className="input"
                value={settings.smtpHost ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, smtpHost: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>SMTP Port</label>
              <input
                className="input"
                value={String(settings.smtpPort ?? "")}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    smtpPort: Number(event.target.value) || null
                  }))
                }
              />
            </div>
            <div className="field">
              <label>SMTP User</label>
              <input
                className="input"
                value={settings.smtpUser ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, smtpUser: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>SMTP Password</label>
              <input
                className="input"
                type="password"
                value={settings.smtpPassword ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, smtpPassword: event.target.value }))
                }
              />
            </div>
          </div>

          <div>
            <h2 className="section-title">IA por tenant</h2>
            <p className="section-subtitle">
              Configuracion separada por bloques. No hace falta activar API key todavia para el
              piloto.
            </p>
          </div>

          <div className="grid grid-2">
            <div className="field">
              <label>Proveedor IA</label>
              <input
                className="input"
                value={settings.aiProvider ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, aiProvider: event.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Modelo</label>
              <input
                className="input"
                value={settings.aiModel ?? ""}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, aiModel: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="field">
            <label>API Key IA</label>
            <input
              className="input"
              type="password"
              value={settings.aiApiKey ?? ""}
              onChange={(event) =>
                setSettings((current) => ({ ...current, aiApiKey: event.target.value }))
              }
            />
          </div>

          <div className="field">
            <label>Instrucciones generales del asistente</label>
            <textarea
              className="textarea"
              value={settings.assistantInstructions ?? ""}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  assistantInstructions: event.target.value
                }))
              }
            />
          </div>
          <div className="field">
            <label>Instrucciones operativas</label>
            <textarea
              className="textarea"
              value={settings.operationalInstructions ?? ""}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  operationalInstructions: event.target.value
                }))
              }
            />
          </div>
          <div className="field">
            <label>Instrucciones de RRHH</label>
            <textarea
              className="textarea"
              value={settings.hrInstructions ?? ""}
              onChange={(event) =>
                setSettings((current) => ({ ...current, hrInstructions: event.target.value }))
              }
            />
          </div>
          <div className="field">
            <label>Notas de integracion</label>
            <textarea
              className="textarea"
              value={settings.integrationNotes ?? ""}
              onChange={(event) =>
                setSettings((current) => ({ ...current, integrationNotes: event.target.value }))
              }
            />
          </div>

          <div className="actions">
            <button className="button" type="submit" disabled={isSaving}>
              {isSaving ? "Guardando..." : "Guardar configuracion"}
            </button>
          </div>
        </form>

        <section className="grid grid-2">
          <form className="card stack" onSubmit={onUploadDocument}>
            <div>
              <h2 className="section-title">Documentos base</h2>
              <p className="section-subtitle">
                Sube documentos operativos, de RRHH, empresa o politicas y marca los que la IA
                puede usar.
              </p>
            </div>

            <div className="split">
              <div className="field">
                <label>Area</label>
                <select
                  className="select"
                  value={documentForm.area}
                  onChange={(event) =>
                    setDocumentForm((current) => ({ ...current, area: event.target.value }))
                  }
                >
                  <option value="manager">Manager</option>
                  <option value="rrhh">RRHH</option>
                  <option value="empresa">Empresa</option>
                </select>
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
                  <option value="rrhh">RRHH</option>
                  <option value="empresa">Empresa</option>
                  <option value="manual">Manual</option>
                  <option value="politica">Politica</option>
                </select>
              </div>
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
              id="settings-document-file"
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

          <section className="card stack">
            <div>
              <h2 className="section-title">Documentos cargados</h2>
              <p className="section-subtitle">Vista consolidada de los documentos base del tenant.</p>
            </div>
            {documents.length === 0 ? (
              <div className="empty">Todavia no hay documentos base cargados.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Titulo</th>
                      <th>Area</th>
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
                          <div className="muted">
                            Subido por {document.uploadedBy?.fullName ?? "sistema"}
                          </div>
                        </td>
                        <td>{document.area}</td>
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
      </section>
    </main>
  );
}
