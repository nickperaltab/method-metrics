import { useState, useEffect, useCallback } from 'react';
import { initBqAuth, connectBq, disconnectBq } from '../lib/bigquery';

export function useBqAuth() {
  const [connected, setConnected] = useState(false);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    initBqAuth((token) => {
      setConnected(true);
      fetchEmail(token);
    });
  }, []);

  async function fetchEmail(token) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserEmail(data.email);
      }
    } catch { /* ignore */ }
  }

  const connect = useCallback(() => {
    connectBq((token) => {
      setConnected(true);
      fetchEmail(token);
    });
  }, []);

  const disconnect = useCallback(() => {
    disconnectBq();
    setConnected(false);
    setUserEmail(null);
  }, []);

  return { connected, userEmail, connect, disconnect };
}
