// Single place that talks to the backend. Everything else in the frontend
// calls the named functions at the bottom of this file.

const API_URL = import.meta.env.VITE_API_URL || "/api";
const SESSION_KEY = "inmind-session";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/* ---------- session storage ---------- */

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

let session = readSession();
let onSessionLost = () => {};

export const getSession = () => session;

export function setSession(next) {
  session = next;
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: the session just won't survive a reload */
  }
}

// Called when a refresh fails, so the UI can drop back to the sign-in screen.
export function setSessionLostHandler(handler) {
  onSessionLost = handler;
}

/* ---------- request plumbing ---------- */

let refreshing = null;

function refreshSession() {
  if (!session?.refresh_token) return Promise.reject(new Error("No session"));
  refreshing ??= fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.session) throw new Error("Refresh failed");
      setSession(data.session);
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request(path, init = {}, retry = true) {
  const { json, skipAuth = false, ...options } = init;
  const headers = { ...options.headers };
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(json);
  }
  if (!skipAuth && session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }

  // Expired access token: refresh once, then replay the request.
  if (response.status === 401 && !skipAuth && retry && session?.refresh_token) {
    try {
      await refreshSession();
    } catch {
      setSession(null);
      onSessionLost();
      throw new ApiError("Your session expired. Sign in again.", 401);
    }
    return request(path, init, false);
  }

  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(data.error || "Something went wrong.", response.status);
  }
  return data;
}

/* ---------- endpoints ---------- */

export const api = {
  signup: (payload) => request("/auth/signup", { method: "POST", json: payload, skipAuth: true }),
  login: (payload) => request("/auth/login", { method: "POST", json: payload, skipAuth: true }),
  me: () => request("/auth/me"),

  listEntries: () => request("/entries"),
  createEntry: (fields) => request("/entries", { method: "POST", json: fields }),
  updateEntry: (id, fields) => request(`/entries/${id}`, { method: "PATCH", json: fields }),
  lockEntry: (id) => request(`/entries/${id}/lock`, { method: "POST" }),

  addNote: (entryId, text) => request(`/entries/${entryId}/notes`, { method: "POST", json: { text } }),
  deleteNote: (id) => request(`/notes/${id}`, { method: "DELETE" }),

  uploadMedia: (entryId, file) =>
    request(`/entries/${entryId}/media/upload`, {
      method: "POST",
      body: file,
      headers: {
        "Content-Type": file.type,
        "X-File-Name": encodeURIComponent(file.name),
      },
    }),
  deleteMedia: (id) => request(`/media/${id}`, { method: "DELETE" }),
};
