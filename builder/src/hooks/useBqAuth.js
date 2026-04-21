import { useState, useEffect, useCallback } from 'react';
import { initBqAuth, connectBq, disconnectBq } from '../lib/bigquery';
import posthog from '../lib/posthog';

export function useBqAuth() {
  const [connected, setConnected] = useState(false);
  const [userEmail, setUserEmail] = useState(null);
  const [userAvatar, setUserAvatar] = useState(null);

  useEffect(() => {
    initBqAuth(
      (token) => {
        setConnected(true);
        fetchEmail(token);
      },
      () => {
        setConnected(false);
      }
    );

    // Listen for mid-session token expiry (triggered by disconnectBq on 401)
    function handleDisconnect() {
      setConnected(false);
      setUserEmail(null);
      setUserAvatar(null);
    }
    window.addEventListener('bq:disconnect', handleDisconnect);
    return () => window.removeEventListener('bq:disconnect', handleDisconnect);
  }, []);

  async function fetchEmail(token) {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserEmail(data.email);
        setUserAvatar(data.picture);
        posthog.identify(data.email, { email: data.email });
        posthog.capture('bq_connected', { email: data.email });
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
    posthog.capture('bq_disconnected');
    posthog.reset();
  }, []);

  return { connected, userEmail, userAvatar, connect, disconnect };
}
