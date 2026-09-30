const BASE = "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  // Una petición con sesión que el servidor rechaza por no autenticada es una
  // sesión caducada o una cuenta dada de baja: la aplicación vuelve a la entrada
  // en vez de quedarse mostrando errores en cada pantalla.
  if (res.status === 401 && token) window.dispatchEvent(new Event("cuida:sesion-caducada"));

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ? JSON.stringify(body.error) : res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string, token: string | null) => request<T>(path, { method: "GET", token }),
  post: <T>(path: string, body: unknown, token: string | null) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), token }),
  patch: <T>(path: string, body: unknown, token: string | null) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), token }),
  put: <T>(path: string, body: unknown, token: string | null) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body), token }),
  delete: <T>(path: string, token: string | null) => request<T>(path, { method: "DELETE", token }),
};
