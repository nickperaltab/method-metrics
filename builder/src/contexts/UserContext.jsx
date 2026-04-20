import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchUserByEmail, upsertUserByEmail } from '../lib/supabase';

const UserContext = createContext(null);

export function UserProvider({ children, email }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) {
      setCurrentUser(null);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        let user = await fetchUserByEmail(email);
        if (!user) {
          // Auto-create viewer account for first-time users
          user = await upsertUserByEmail(email);
        }
        setCurrentUser(user);
      } catch (e) {
        console.error('Failed to identify user:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [email]);

  return (
    <UserContext.Provider value={{ currentUser, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
