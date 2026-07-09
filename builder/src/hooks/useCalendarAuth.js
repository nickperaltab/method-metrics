import { useState, useEffect, useCallback } from 'react';
import { initCalendarAuth, connectCalendar, disconnectCalendar, fetchTodayEvents } from '../lib/calendar';

export function useCalendarAuth() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadEvents = useCallback((token) => {
    setLoading(true);
    setError(null);
    fetchTodayEvents(token)
      .then(setEvents)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    initCalendarAuth(
      (token) => { setConnected(true); loadEvents(token); },
      () => setConnected(false),
    );
  }, [loadEvents]);

  const connect = useCallback(() => {
    connectCalendar((token) => { setConnected(true); loadEvents(token); });
  }, [loadEvents]);

  const disconnect = useCallback(() => {
    disconnectCalendar();
    setConnected(false);
    setEvents([]);
  }, []);

  return { connected, events, loading, error, connect, disconnect };
}
