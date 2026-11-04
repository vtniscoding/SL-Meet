import { useState, useEffect } from 'react';
import { verifyAdminKey, getStoredAdminKey } from '../services/authService';

export function useAdminAuth(onAuthenticated) {
  const [adminKey, setAdminKey] = useState(getStoredAdminKey());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerifyKey = async (keyToVerify = adminKey) => {
    setAuthError('');
    setLoading(true);

    try {
      const result = await verifyAdminKey(keyToVerify);
      if (result.success) {
        setIsAuthenticated(true);
        onAuthenticated?.();
      } else {
        setIsAuthenticated(false);
        setAuthError(result.message || 'Invalid Admin Secret Key.');
      }
    } catch (err) {
      setAuthError('Authentication error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Attempt auto-login if key is already persisted in localStorage
  useEffect(() => {
    const savedKey = getStoredAdminKey();
    if (savedKey) {
      handleVerifyKey(savedKey);
    }
  }, []);

  return {
    adminKey,
    setAdminKey,
    isAuthenticated,
    setIsAuthenticated,
    authError,
    setAuthError,
    loading,
    handleVerifyKey,
  };
}

