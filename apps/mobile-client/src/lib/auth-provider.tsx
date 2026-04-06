import React, { useCallback, useEffect, useState } from "react";
import { AuthContext, type AuthState } from "./auth";
import { authApi } from "./api";

// SecureStore import (lazy to support web)
let SecureStore: typeof import("expo-secure-store") | null = null;
try {
  SecureStore = require("expo-secure-store");
} catch {
  // Web fallback
}

const STORAGE_KEY = "ltex_auth";

async function loadAuth(): Promise<Partial<AuthState>> {
  try {
    if (SecureStore) {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    }
    // Web fallback
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveAuth(state: Partial<AuthState>): Promise<void> {
  try {
    const raw = JSON.stringify(state);
    if (SecureStore) {
      await SecureStore.setItemAsync(STORAGE_KEY, raw);
    } else if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, raw);
    }
  } catch {}
}

async function clearAuth(): Promise<void> {
  try {
    if (SecureStore) {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } else if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    customerId: null,
    customerName: null,
    phone: null,
    isLoading: true,
  });

  useEffect(() => {
    loadAuth().then((saved) => {
      setState({
        customerId: (saved.customerId as string) ?? null,
        customerName: (saved.customerName as string) ?? null,
        phone: (saved.phone as string) ?? null,
        isLoading: false,
      });
    });
  }, []);

  const login = useCallback(async (phone: string, name?: string) => {
    const result = await authApi.login(phone, name);
    const newState: AuthState = {
      customerId: result.customerId,
      customerName: result.name,
      phone: result.phone,
      isLoading: false,
    };
    setState(newState);
    await saveAuth(newState);
  }, []);

  const logout = useCallback(async () => {
    setState({ customerId: null, customerName: null, phone: null, isLoading: false });
    await clearAuth();
  }, []);

  const updateName = useCallback((name: string) => {
    setState((prev) => {
      const next = { ...prev, customerName: name };
      saveAuth(next);
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateName }}>
      {children}
    </AuthContext.Provider>
  );
}
