import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch or ensure profile in public.users
  const loadProfile = useCallback(async (currentUser) => {
    if (!currentUser) {
      setProfile(null);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Error fetching profile from public.users:', error.message);
      }

      if (data) {
        setProfile(data);
        return data;
      }

      // Fallback: If trigger didn't fire or row doesn't exist yet, insert profile
      const defaultName =
        currentUser.user_metadata?.display_name ||
        currentUser.email?.split('@')[0] ||
        'User';

      const { data: inserted, error: insertError } = await supabase
        .from('users')
        .insert({
          id: currentUser.id,
          display_name: defaultName,
          role: 'user',
        })
        .select()
        .single();

      if (!insertError && inserted) {
        setProfile(inserted);
        return inserted;
      }

      const fallbackProfile = {
        id: currentUser.id,
        display_name: defaultName,
        role: 'user',
      };
      setProfile(fallbackProfile);
      return fallbackProfile;
    } catch (err) {
      console.error('Unexpected error loading profile:', err);
      const fallback = {
        id: currentUser.id,
        display_name: currentUser.email?.split('@')[0] || 'User',
        role: 'user',
      };
      setProfile(fallback);
      return fallback;
    }
  }, []);

  // Listen to Supabase Auth State changes
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user) {
          await loadProfile(initialSession.user);
        }
      } catch (err) {
        console.error('Failed to get initial session:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        await loadProfile(newSession.user);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [loadProfile]);

  // Sign In with Email & Password
  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
    return data;
  };

  // Sign Up with Email, Password & Display Name
  const signUp = async (email, password, displayName) => {
    const trimmedEmail = email.trim();
    const trimmedName = displayName?.trim() || trimmedEmail.split('@')[0];

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          display_name: trimmedName,
          role: 'user',
        },
      },
    });
    if (error) throw error;

    // In case email confirmation is disabled or auto-confirmed, refresh profile
    if (data?.user) {
      await loadProfile(data.user);
    }
    return data;
  };

  // Sign Out
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.warn('Supabase sign out error:', error.message);
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  // Update Display Name
  const updateDisplayName = async (newDisplayName) => {
    if (!user) return;
    const trimmed = newDisplayName.trim();
    if (!trimmed) return;

    const { error } = await supabase
      .from('users')
      .update({ display_name: trimmed })
      .eq('id', user.id);

    if (error) throw error;
    setProfile((prev) => (prev ? { ...prev, display_name: trimmed } : null));
  };

  const value = {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    updateDisplayName,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
