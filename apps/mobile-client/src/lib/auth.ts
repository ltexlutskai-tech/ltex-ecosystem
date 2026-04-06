/**
 * Auth state management for mobile client.
 * Stores customerId in SecureStore (encrypted device storage).
 */

import { createContext, useContext } from "react";

export interface AuthState {
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  isLoading: boolean;
}

export interface AuthContextType extends AuthState {
  login: (phone: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateName: (name: string) => void;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
