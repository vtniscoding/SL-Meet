import { useCallback, useState } from 'react';
import { CAPTION_CONFIG } from '../config/captionConfig';

const DEFAULTS = {
  size: 'l', // 'm' | 'l' | 'xl'
  opacity: 0.85, // 0.6 to 1.0
  rows: 3, // 2 to 4
  showNames: true, // boolean
};

function sanitizePrefs(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULTS;
  const size = ['m', 'l', 'xl'].includes(raw.size) ? raw.size : DEFAULTS.size;
  const opacity = typeof raw.opacity === 'number'
    ? Math.min(1.0, Math.max(0.6, raw.opacity))
    : DEFAULTS.opacity;
  const rows = typeof raw.rows === 'number'
    ? Math.min(4, Math.max(2, Math.round(raw.rows)))
    : DEFAULTS.rows;
  const showNames = typeof raw.showNames === 'boolean' ? raw.showNames : DEFAULTS.showNames;

  return { size, opacity, rows, showNames };
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(CAPTION_CONFIG.PREFS_KEY);
    if (!raw) return DEFAULTS;
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return DEFAULTS;
  }
}

export function useCaptionPrefs() {
  const [prefs, setPrefsState] = useState(loadPrefs);

  const setPrefs = useCallback((patch) => {
    setPrefsState((prev) => {
      const next = sanitizePrefs({ ...prev, ...patch });
      try {
        localStorage.setItem(CAPTION_CONFIG.PREFS_KEY, JSON.stringify(next));
      } catch (err) {
        console.warn('[useCaptionPrefs] Failed to persist preferences to localStorage:', err);
      }
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefsState(DEFAULTS);
    try {
      localStorage.removeItem(CAPTION_CONFIG.PREFS_KEY);
    } catch {}
  }, []);

  return [prefs, setPrefs, resetPrefs];
}
