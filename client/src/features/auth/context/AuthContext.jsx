import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '@sl-meet/shared';

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

      if (insertError) {
        console.warn('Fallback profile creation notice:', insertError.message);
        const fallbackProfile = {
          id: currentUser.id,
          display_name: defaultName,
          role: 'user',
        };
        setProfile(fallbackProfile);
        return fallbackProfile;
      }

      setProfile(inserted);
      return inserted;
    } catch (err) {
      console.warn('loadProfile caught error:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    // Initial session retrieval
    supabase.auth
      .getSession()
      .then(async ({ data: { session: initSession } }) => {
        if (!mounted) return;
        setSession(initSession);
        setUser(initSession?.user ?? null);
        if (initSession?.user) {
          await loadProfile(initSession.user);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.warn('Get session warning:', err);
        if (mounted) setLoading(false);
      });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
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

  // Sign in with email and password
  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }, []);

  // Sign up with email, password, and optional display name
  const signUp = useCallback(async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName || email.split('@')[0],
        },
      },
    });
    if (error) throw error;
    return data;
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Sign out warning:', err);
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
    }
  }, []);

  // Update user profile display name
  const updateDisplayName = useCallback(
    async (newName) => {
      if (!user) throw new Error('No user logged in');
      const cleanName = newName?.trim();
      if (!cleanName) throw new Error('Display name cannot be empty');

      const { data, error } = await supabase
        .from('users')
        .update({ display_name: cleanName, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;
      setProfile(data);
      return data;
    },
    [user]
  );

  const isAdmin = Boolean(
    profile?.role === 'admin' ||
    user?.app_metadata?.role === 'admin' ||
    user?.user_metadata?.role === 'admin'
  );

  const value = {
    user,
    session,
    profile,
    isAdmin,
    loading,
    signIn,
    signUp,
    signOut,
    updateDisplayName,
    refreshProfile: () => loadProfile(user),
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

