const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

function buildHeaders(token) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function getJson(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed");
  }
  return res.json();
}

export async function postJson(path, body, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: buildHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "Request failed");
  }
  return res.json();
}

export async function downloadCsv(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: buildHeaders(token),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || "Export failed");
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const filename = res.headers.get("Content-Disposition")?.split("filename=")?.[1]?.replace(/"/g, "");
  link.download = filename || "export.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
