const DEFAULT_API_BASE = "http://127.0.0.1:8787/api/v1";

export function getApiBase(argvOptions = {}, env = process.env) {
  return (
    argvOptions.api ||
    env.MEMFORGE_API_URL ||
    env.PNW_API_URL ||
    DEFAULT_API_BASE
  );
}

export function getAuthToken(argvOptions = {}, env = process.env) {
  return argvOptions.token || env.MEMFORGE_TOKEN || env.PNW_TOKEN || "";
}

export async function requestJson(apiBase, path, { method = "GET", token, body } = {}) {
  const url = new URL(path.replace(/^\/+/, ""), ensureTrailingSlash(apiBase));
  const headers = {
    Accept: "application/json",
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const payload = text ? safeParseJson(text) : null;

  if (!response.ok) {
    const error = payload?.error;
    const code = error?.code || `HTTP_${response.status}`;
    const message = error?.message || text || response.statusText || "Request failed";
    throw new Error(`${code}: ${message}`);
  }

  if (payload && payload.ok === false) {
    const error = payload.error || {};
    throw new Error(`${error.code || "INTERNAL_ERROR"}: ${error.message || "Request failed"}`);
  }

  return payload ?? {};
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
