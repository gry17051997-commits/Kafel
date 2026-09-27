import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, post, TOKEN_KEY } from '@/src/api';
import { storage } from '@/src/utils/storage';
import type { User } from '@/src/constants';

const GUEST_KEY = 'grafik_guest';

type AuthState = {
  user: User | null;
  guest: boolean;
  loading: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  continueGuest: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState>(null as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [guest, setGuest] = useState(false);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    try {
      const token = await storage.getItem(TOKEN_KEY);
      const guestFlag = await storage.getItem(GUEST_KEY);
      if (token) {
        try {
          const me = await api('/api/auth/me');
          setUser(me);
          setGuest(false);
          return;
        } catch {
          await storage.removeItem(TOKEN_KEY);
        }
      }
      if (guestFlag === '1') setGuest(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await post('/api/auth/login', { email, password });
    await storage.setItem(TOKEN_KEY, res.access_token);
    await storage.removeItem(GUEST_KEY);
    setUser(res.user);
    setGuest(false);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await post('/api/auth/register', { email, password, displayName });
      await storage.setItem(TOKEN_KEY, res.access_token);
      await storage.removeItem(GUEST_KEY);
      setUser(res.user);
      setGuest(false);
    },
    []
  );

  const logout = useCallback(async () => {
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(GUEST_KEY);
    setUser(null);
    setGuest(false);
  }, []);

  const continueGuest = useCallback(async () => {
    await storage.setItem(GUEST_KEY, '1');
    setGuest(true);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api('/api/auth/me');
      setUser(me);
    } catch {
      /* ignore */
    }
  }, []);

  const value: AuthState = {
    user,
    guest,
    loading,
    isAdmin: user?.role === 'admin',
    canEdit: user?.role === 'admin',
    login,
    register,
    logout,
    continueGuest,
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
