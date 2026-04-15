"use client";

import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export default function ManagerPage() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [pickings, setPickings] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);

  useEffect(() => {
    void Promise.all([
      fetch(`${API_BASE_URL}/manager/driver-routes`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/manager/warehouse-pickings`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_BASE_URL}/manager/incidents`, { credentials: "include" }).then((r) => r.json())
    ]).then(([routesData, pickingsData, incidentsData]) => {
      setRoutes(routesData);
      setPickings(pickingsData);
      setIncidents(incidentsData);
    });
  }, []);

  return (
    <main className="shell">
      <h1>Panel Manager</h1>
      <div className="grid grid-2">
        <section className="card">
          <h2>Rutas</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Chofer</th>
                <th>Camion</th>
                <th>Estado</th>
                <th>Inicio</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr key={route.id}>
                  <td>{route.driver?.fullName}</td>
                  <td>{route.vehicleLabel}</td>
                  <td>{route.status}</td>
                  <td>{new Date(route.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Pickings</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Pedido</th>
                <th>Ruta</th>
              </tr>
            </thead>
            <tbody>
              {pickings.map((item) => (
                <tr key={item.id}>
                  <td>{item.worker?.fullName}</td>
                  <td>{item.orderRef}</td>
                  <td>{item.routeRef ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card" style={{ gridColumn: "1 / -1" }}>
          <h2>Incidencias</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Origen</th>
                <th>Tipo</th>
                <th>Severidad</th>
                <th>Descripcion</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id}>
                  <td>{new Date(incident.createdAt).toLocaleString()}</td>
                  <td>{incident.sourceType}</td>
                  <td>{incident.incidentType}</td>
                  <td>{incident.severity}</td>
                  <td>{incident.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
