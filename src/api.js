// Centralized API layer. Every backend call goes through here: credentials
// (the JWT session cookie), JSON handling, and a consistent error shape.
//
// Auth (below) is the one exception: this demo build has no FastAPI backend
// to log in against, so authApi talks to Supabase instead. Everything else
// (sessions/findings/investigations/reports/...) still calls the FastAPI
// routes — which simply aren't reachable from a static Netlify deploy, so
// the UI gracefully falls back to the bundled sample investigation. Point
// VITE_API_PROXY_TARGET / a real backend at these routes to make them live.
import { supabase } from "./supabaseClient";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body, params } = {}) {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
  }
  let res;
  try {
    res = await fetch(url.toString(), {
      method,
      credentials: "include",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Network error — is the backend running and reachable?", 0);
  }
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const detail = isJson && data ? data.detail || data.error : null;
    throw new ApiError(typeof detail === "string" ? detail : `Request failed (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  get: (path, params) => request(path, { method: "GET", params }),
  post: (path, body, params) => request(path, { method: "POST", body, params }),
  put: (path, body, params) => request(path, { method: "PUT", body, params }),
};

// --- auth (Supabase-backed) ---
function shapeUser(supabaseUser) {
  if (!supabaseUser) return null;
  const meta = supabaseUser.user_metadata || {};
  return {
    id: supabaseUser.id,
    username: meta.full_name || supabaseUser.email,
    full_name: meta.full_name || "",
    email: supabaseUser.email || "",
  };
}

export const authApi = {
  me: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new ApiError("Not signed in", 401);
    return shapeUser(data.session.user);
  },
  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new ApiError(error.message, error.status || 400);
    return shapeUser(data.user);
  },
  // fullName is optional — kept as the first arg for backwards-compat with
  // the call sites below, which pass the value from the "Full Name" field.
  register: async (fullName, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName || "" } },
    });
    if (error) throw new ApiError(error.message, error.status || 400);
    if (!data.session) {
      // Project has "Confirm email" turned on — account exists but isn't
      // signed in yet. Use status 202 as a signal (not a real failure) so
      // the UI can show a "check your inbox" screen instead of a red error.
      throw new ApiError("confirmation_required", 202);
    }
    return shapeUser(data.user);
  },
  logout: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new ApiError(error.message, error.status || 400);
  },
  updateMe: async ({ full_name, email } = {}) => {
    const { data, error } = await supabase.auth.updateUser({
      ...(email ? { email } : {}),
      data: { full_name: full_name || "" },
    });
    if (error) throw new ApiError(error.message, error.status || 400);
    return shapeUser(data.user);
  },
};

// --- investigations ---
export const invApi = {
  get: (id) => api.get(`/api/investigations/${id}`),
  summary: (id) => api.get(`/api/investigations/${id}/summary`),
  loadDemo: () => api.post("/api/demo/load", {}),
  upload: (file, title, onProgress) =>
    new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/pcaps/upload?title=${encodeURIComponent(title)}`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let data;
        try { data = JSON.parse(xhr.responseText); } catch { data = null; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new ApiError((data && (data.detail || data.error)) || `Upload failed (${xhr.status})`, xhr.status));
      };
      xhr.onerror = () => reject(new ApiError("Network error during upload", 0));
      xhr.send(form);
    }),
};

// --- sessions ---
export const sessionsApi = {
  // Paginated: returns { items, total, page, page_size, total_pages } so a
  // large PCAP's session list can be paged through instead of loaded in one go.
  list: (investigationId, page = 1, pageSize = 50) =>
    api.get("/api/sessions", { investigation_id: investigationId, page, page_size: pageSize }),
  get: (id) => api.get(`/api/sessions/${id}`),
  tls: (id) => api.get(`/api/sessions/${id}/tls`),
  certificate: (id) => api.get(`/api/sessions/${id}/certificate`),
  risk: (id) => api.get(`/api/risk/${id}`),
  ai: (id) => api.get(`/api/ai/${id}`),
};

// --- findings ---
export const findingsApi = {
  list: (investigationId) => api.get("/api/findings", { investigation_id: investigationId }),
  get: (id) => api.get(`/api/findings/${id}`),
};

// --- reports ---
export const reportsApi = {
  generate: (investigationId, format) => api.post("/api/reports", {}, { investigation_id: investigationId, format }),
  list: (investigationId) => api.get("/api/reports", { investigation_id: investigationId }),
  downloadUrl: (id) => `/api/reports/${id}`,
};

// --- assistant ---
export const assistantApi = {
  ask: (message, investigationId, sessionId) =>
    api.post("/api/assistant", { message, investigation_id: investigationId, session_id: sessionId }),
};

// --- system ---
export const systemApi = {
  dependencies: () => api.get("/api/system/dependencies"),
  health: () => api.get("/api/health"),
};

// --- threat intelligence ---
export const threatIntelApi = {
  get: (investigationId) => api.get("/api/threat-intel", { investigation_id: investigationId }),
};

// --- tools ---
export const toolsApi = {
  // File-download endpoints: navigated to directly (new tab / anchor),
  // not fetched through the JSON `api` helper.
  downloadPcapUrl: (investigationId) => `/api/investigations/${investigationId}/pcap/download`,
  exportFindingPacketsUrl: (findingId) => `/api/findings/${findingId}/packet-export`,
};
