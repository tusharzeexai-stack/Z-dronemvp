/**
 * Z-DRONE API Service
 * Centralized Axios HTTP client for all backend communication.
 * 
 * Configure VITE_API_URL in your .env file:
 *   VITE_API_URL=http://localhost:8000    (development)
 *   VITE_API_URL=https://api.z-drone.com (production on AWS)
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://13.200.250.121:8000';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(err.detail || 'API Error', res.status);
  }

  if (res.status === 204) return null;
  return res.json();
}

function getToken() {
  try {
    const user = JSON.parse(localStorage.getItem('z_drone_user') || '{}');
    return user.token || null;
  } catch {
    return null;
  }
}

// ── Auth ─────────────────────────────────────────────────────
export const authApi = {
  login: (username, password) =>
    request('POST', '/auth/login', { username, password }),
};

// ── Drones ───────────────────────────────────────────────────
export const dronesApi = {
  list: () => request('GET', '/drones', null, getToken()),
  get: (id) => request('GET', `/drones/${id}`, null, getToken()),
  create: (data) => request('POST', '/drones', data, getToken()),
  updateTelemetry: (id, data) => request('PUT', `/drones/${id}/telemetry`, data, getToken()),
  delete: (id) => request('DELETE', `/drones/${id}`, null, getToken()),
};

// ── Flights ──────────────────────────────────────────────────
export const flightsApi = {
  list: () => request('GET', '/flights', null, getToken()),
  get: (id) => request('GET', `/flights/${id}`, null, getToken()),
  create: (data) => request('POST', '/flights', data, getToken()),
  update: (id, data) => request('PUT', `/flights/${id}`, data, getToken()),
  delete: (id) => request('DELETE', `/flights/${id}`, null, getToken()),
};

// ── Alerts ───────────────────────────────────────────────────
export const alertsApi = {
  list: () => request('GET', '/alerts', null, getToken()),
  create: (data) => request('POST', '/alerts', data, getToken()),
  resolve: (id) => request('PUT', `/alerts/${id}/resolve`, null, getToken()),
  resolveAll: () => request('PUT', '/alerts/resolve-all', null, getToken()),
};

// ── Streams (Kinesis Video) ───────────────────────────────────
export const streamsApi = {
  getStreamInfo: (droneId) => request('GET', `/streams/${droneId}`, null, getToken()),
  createStream: (droneId) => request('POST', `/streams/${droneId}/create`, null, getToken()),
  getViewerCredentials: (droneId) => request('GET', `/streams/${droneId}/viewer-credentials`, null, getToken()),
};

// ── Detections (Jetson AI inference) ──────────────────────────
export const detectionsApi = {
  post: (payload) => request('POST', '/api/v1/detections', payload, getToken()),
  getStats: (deviceId) => request('GET', `/api/v1/detections/stats/${deviceId}`, null, getToken()),
  getRecent: (deviceId, limit = 50) => request('GET', `/api/v1/detections/recent/${deviceId}?limit=${limit}`, null, getToken()),
};

// ── Health ───────────────────────────────────────────────────
export const healthApi = {
  check: () => request('GET', '/health'),
};

export { BASE_URL };
