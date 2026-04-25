const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export class AuthExpiredError extends Error {}

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession() {
  const response = await fetch(`${API_BASE_URL}/auth/web/refresh`, {
    method: "POST",
    credentials: "include"
  });

  return response.ok;
}

async function ensureRefresh() {
  if (!refreshPromise) {
    refreshPromise = refreshSession().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function apiFetch(input: string, init?: RequestInit) {
  const request = {
    credentials: "include" as const,
    ...init
  };

  let response = await fetch(`${API_BASE_URL}${input}`, request);

  if (response.status === 401) {
    const refreshed = await ensureRefresh();
    if (!refreshed) {
      throw new AuthExpiredError("Session expired");
    }

    response = await fetch(`${API_BASE_URL}${input}`, request);
  }

  if (response.status === 401) {
    throw new AuthExpiredError("Session expired");
  }

  return response;
}

export { API_BASE_URL };
