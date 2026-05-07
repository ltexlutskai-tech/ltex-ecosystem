"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface ClientCustomer {
  id: string;
  name: string;
}

const CustomerContext = createContext<ClientCustomer | null>(null);

export function CustomerProvider({
  customer,
  children,
}: {
  customer: ClientCustomer | null;
  children: ReactNode;
}) {
  return (
    <CustomerContext.Provider value={customer}>
      {children}
    </CustomerContext.Provider>
  );
}

/**
 * Returns the current customer (id + name) or null when the visitor is
 * a guest. Reads the value provided by the server-rendered layout, so it
 * stays in sync with the cookie without an extra client fetch.
 */
export function useCustomer(): ClientCustomer | null {
  return useContext(CustomerContext);
}
