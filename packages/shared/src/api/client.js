import { SOCKET_URL } from '../services/socket.js';

/**
 * Standard API client for communication with SL-Meet backend server
 */
export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${SOCKET_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || errorBody.message || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function verifyAdminKey(adminKey) {
  return apiRequest('/api/admin/verify', {
    method: 'POST',
    headers: {
      'x-admin-key': adminKey,
    },
    body: JSON.stringify({ key: adminKey }),
  });
}

