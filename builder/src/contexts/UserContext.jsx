import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchUsers as fetchUsersApi } from '../lib/supabase';

const UserContext = createContext(null);

const STORAGE_KEY = 'method_metrics_user';

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const data = await fetchUsersApi();
      setUsers(data);

      // Check localStorage for saved user
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        const saved = data.find(u => u.id === savedId);
        if (saved) {
          setCurrentUser(saved);
          setLoading(false);
          return;
        }
      }

      // No saved user — show picker
      setShowPicker(true);
      setLoading(false);
    } catch (e) {
      console.error('Failed to load users:', e);
      setLoading(false);
    }
  }

  function selectUser(user) {
    setCurrentUser(user);
    localStorage.setItem(STORAGE_KEY, user.id);
    setShowPicker(false);
  }

  function switchUser() {
    setShowPicker(true);
  }

  return (
    <UserContext.Provider value={{ currentUser, users, loading, showPicker, selectUser, switchUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
