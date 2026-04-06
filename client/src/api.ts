const API_BASE = "/api";

let authToken: string | null = localStorage.getItem("token");

export function setToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || payload.details || "Request failed");
  }

  return payload as T;
}
