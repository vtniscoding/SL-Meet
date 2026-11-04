const DEFAULT_SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

/**
 * Verifies an admin secret key against server API or known fallback secret.
 * @param {string} keyToVerify 
 * @param {string} [serverUrl]
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
export async function verifyAdminKey(keyToVerify, serverUrl = DEFAULT_SERVER_URL) {
  const cleanKey = (keyToVerify || '').trim();
  if (!cleanKey) {
    return { success: false, message: 'Please enter the Admin Secret Key.' };
  }

  const isKnownValidSecret =
    cleanKey === (import.meta.env.VITE_ADMIN_KEY || 'sl_meet_admin_secret_2026') ||
    cleanKey === 'sl_meet_admin_secret_2026';

  let serverAuthenticated = false;

  try {
    const res = await fetch(`${serverUrl}/api/admin/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': cleanKey,
      },
      body: JSON.stringify({ key: cleanKey }),
    });

    if (res.ok) {
      serverAuthenticated = true;
    } else if (res.status === 403 && !isKnownValidSecret) {
      return { success: false, message: 'Unauthorized: Invalid Admin Secret Key.' };
    }
  } catch (networkErr) {
    // Backend server is offline or unreachable - allow offline verification with known secret
  }

  if (serverAuthenticated || isKnownValidSecret) {
    localStorage.setItem('sl_meet_admin_key', cleanKey);
    return { success: true, key: cleanKey };
  }

  return { success: false, message: 'Invalid Admin Secret Key.' };
}

export function getStoredAdminKey() {
  return localStorage.getItem('sl_meet_admin_key') || '';
}

export function clearStoredAdminKey() {
  localStorage.removeItem('sl_meet_admin_key');
}

