/**
 * 认证上下文
 * 提供全局认证状态管理
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from "react";
import type {
  AuthUser,
  SessionEnvelope,
} from "@mail-agent/shared-types";

// ========== 类型定义 ==========

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

type RegisterStartResult = {
  pending: true;
  email: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  delivery?: "sent" | "logged";
};

type AuthAction =
  | { type: "AUTH_START" }
  | { type: "AUTH_SUCCESS"; payload: AuthUser }
  | { type: "AUTH_FAILURE"; payload: string }
  | { type: "AUTH_LOGOUT" }
  | { type: "AUTH_CHECK_END" };

const initialState: AuthState = {
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "AUTH_START":
      return { ...state, isLoading: true, error: null };
    case "AUTH_SUCCESS":
      return {
        ...state,
        user: action.payload,
        isLoading: false,
        isAuthenticated: true,
        error: null,
      };
    case "AUTH_FAILURE":
      return {
        ...state,
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: action.payload,
      };
    case "AUTH_LOGOUT":
      return {
        ...state,
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
      };
    case "AUTH_CHECK_END":
      return { ...state, isLoading: false };
    default:
      return state;
  }
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (email: string, displayName: string, password: string) => Promise<RegisterStartResult>;
  verifyRegistration: (email: string, code: string) => Promise<void>;
  resendVerificationCode: (email: string) => Promise<RegisterStartResult>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
  updatePreferences: (prefs: { locale?: string; displayName?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ========== API 函数 ==========

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || data.message || "Request failed");
  }

  return data as T;
}

// ========== Provider ==========

interface AuthProviderProps {
  children: React.ReactNode;
  apiBase?: string;
}

export function AuthProvider({ children, apiBase = "/api" }: AuthProviderProps) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const checkSession = useCallback(async () => {
    try {
      const data = await apiFetch<SessionEnvelope>(`${apiBase}/auth/session`);
      if (data.authenticated && data.user) {
        dispatch({ type: "AUTH_SUCCESS", payload: data.user });
      } else {
        dispatch({ type: "AUTH_CHECK_END" });
      }
    } catch {
      dispatch({ type: "AUTH_CHECK_END" });
    }
  }, [apiBase]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string, remember?: boolean) => {
    dispatch({ type: "AUTH_START" });
    try {
      const data = await apiFetch<{ user: AuthUser }>(`${apiBase}/auth/login`, {
        method: "POST",
        body: JSON.stringify({ email, password, remember }),
      });
      dispatch({ type: "AUTH_SUCCESS", payload: data.user });
    } catch (err) {
      dispatch({
        type: "AUTH_FAILURE",
        payload: err instanceof Error ? err.message : "Login failed",
      });
      throw err;
    }
  }, [apiBase]);

  const register = useCallback(async (email: string, displayName: string, password: string) => {
    dispatch({ type: "AUTH_START" });
    try {
      const data = await apiFetch<RegisterStartResult>(`${apiBase}/auth/register`, {
        method: "POST",
        body: JSON.stringify({ email, username: displayName, password }),
      });
      dispatch({ type: "AUTH_CHECK_END" });
      return data;
    } catch (err) {
      dispatch({
        type: "AUTH_FAILURE",
        payload: err instanceof Error ? err.message : "Registration failed",
      });
      throw err;
    }
  }, [apiBase]);

  const verifyRegistration = useCallback(async (email: string, code: string) => {
    dispatch({ type: "AUTH_START" });
    try {
      const data = await apiFetch<{ user: AuthUser }>(`${apiBase}/auth/verify`, {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      dispatch({ type: "AUTH_SUCCESS", payload: data.user });
    } catch (err) {
      dispatch({
        type: "AUTH_FAILURE",
        payload: err instanceof Error ? err.message : "Verification failed",
      });
      throw err;
    }
  }, [apiBase]);

  const resendVerificationCode = useCallback(async (email: string) => {
    dispatch({ type: "AUTH_START" });
    try {
      const data = await apiFetch<RegisterStartResult>(`${apiBase}/auth/resend`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      dispatch({ type: "AUTH_CHECK_END" });
      return data;
    } catch (err) {
      dispatch({
        type: "AUTH_FAILURE",
        payload: err instanceof Error ? err.message : "Failed to resend verification code",
      });
      throw err;
    }
  }, [apiBase]);

  const logout = useCallback(async () => {
    try {
      await apiFetch(`${apiBase}/auth/logout`, { method: "POST" });
    } finally {
      dispatch({ type: "AUTH_LOGOUT" });
    }
  }, [apiBase]);

  const updatePreferences = useCallback(async (prefs: { locale?: string; displayName?: string }) => {
    const data = await apiFetch<{ ok: boolean; user: AuthUser }>(`${apiBase}/auth/preferences`, {
      method: "POST",
      body: JSON.stringify(prefs),
    });
    if (data.ok && data.user) {
      dispatch({ type: "AUTH_SUCCESS", payload: data.user });
    }
  }, [apiBase]);

  const value: AuthContextValue = {
    ...state,
    login,
    register,
    verifyRegistration,
    resendVerificationCode,
    logout,
    checkSession,
    updatePreferences,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ========== Hook ==========

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
