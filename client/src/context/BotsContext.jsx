import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const BotsContext = createContext(null);

export function BotsProvider({ children }) {
  const { user } = useAuth();
  const [bots, setBots] = useState([]);
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setBots([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/bots');
      setBots(data.bots);
      setLimit(data.limit);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <BotsContext.Provider value={{ bots, limit, loading, refresh }}>
      {children}
    </BotsContext.Provider>
  );
}

export function useBots() {
  return useContext(BotsContext);
}
