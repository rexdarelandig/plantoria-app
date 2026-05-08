"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AuthUser } from "@/lib/laravel";
import { fetchCurrentUser, loginWithPassword, logoutOnServer } from "@/lib/laravel";

const STORAGE_TOKEN = "plantoria_sanctum_token";
const STORAGE_USER = "plantoria_user";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = localStorage.getItem(STORAGE_TOKEN);
        const verified = await fetchCurrentUser(t || null);
        if (cancelled) return;
        setUser(verified);
        setToken(t || null);
        localStorage.setItem(STORAGE_USER, JSON.stringify(verified));
      } catch {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_TOKEN);
          localStorage.removeItem(STORAGE_USER);
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token: nextToken, user: nextUser } = await loginWithPassword(
      email,
      password
    );
    if (nextToken) {
      localStorage.setItem(STORAGE_TOKEN, nextToken);
    } else {
      localStorage.removeItem(STORAGE_TOKEN);
    }
    localStorage.setItem(STORAGE_USER, JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(async () => {
    const t = localStorage.getItem(STORAGE_TOKEN);
    await logoutOnServer(t || null);
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      ready,
      login,
      logout,
    }),
    [user, token, ready, login, logout]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
