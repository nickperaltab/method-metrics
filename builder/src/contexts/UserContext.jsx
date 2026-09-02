import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchUserByEmail, upsertUserByEmail, setCurrentUserEmail } from '../lib/supabase';

// Exported so a test can render a component with a chosen user without standing
// up UserProvider, whose lookup is an effect against Supabase. App code should
// use useUser().
export const UserContext = createContext(null);
const IMPERSONATE_KEY = 'method_impersonate_email';

export function UserProvider({ children, email }) {
  const [realUser, setRealUser] = useState(null);
  const [impersonatedUser, setImpersonatedUser] = useState(null);
  const [impersonateEmail, setImpersonateEmailState] = useState(() => {
    try { return localStorage.getItem(IMPERSONATE_KEY) || null; } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // Resolve real user (from Google-auth email)
  useEffect(() => {
    if (!email) {
      setRealUser(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        let user = await fetchUserByEmail(email);
        if (!user) user = await upsertUserByEmail(email);
        setRealUser(user);
      } catch (e) {
        console.error('Failed to identify user:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [email]);

  // Resolve impersonated user if set, only allowed if real user is admin
  useEffect(() => {
    if (!impersonateEmail || realUser?.role !== 'admin') {
      setImpersonatedUser(null);
      return;
    }
    (async () => {
      try {
        const user = await fetchUserByEmail(impersonateEmail);
        setImpersonatedUser(user || null);
      } catch (e) {
        console.error('Impersonation lookup failed:', e);
        setImpersonatedUser(null);
      }
    })();
  }, [impersonateEmail, realUser]);

  const currentUser = impersonatedUser || realUser;
  const impersonating = Boolean(impersonatedUser);

  // Propagate effective email to Supabase headers so RLS sees the right identity
  useEffect(() => {
    setCurrentUserEmail(currentUser?.email || null);
  }, [currentUser]);

  const startImpersonating = useCallback((targetEmail) => {
    if (realUser?.role !== 'admin') return;
    if (!targetEmail || targetEmail === realUser.email) {
      stopImpersonating();
      return;
    }
    try { localStorage.setItem(IMPERSONATE_KEY, targetEmail); } catch {}
    setImpersonateEmailState(targetEmail);
  }, [realUser]);

  const stopImpersonating = useCallback(() => {
    try { localStorage.removeItem(IMPERSONATE_KEY); } catch {}
    setImpersonateEmailState(null);
    setImpersonatedUser(null);
  }, []);

  return (
    <UserContext.Provider value={{
      currentUser,
      realUser,
      impersonating,
      startImpersonating,
      stopImpersonating,
      loading,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
