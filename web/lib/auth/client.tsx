"use client";

import { useAuth } from "@clerk/nextjs";
import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface AppAuth {
  /** Clerk is configured. When false the backend runs in development mode as the local admin. */
  enabled: boolean;
  loaded: boolean;
  signedIn: boolean;
  getToken: () => Promise<string | null>;
}

const NO_AUTH: AppAuth = { enabled: false, loaded: true, signedIn: false, getToken: async () => null };
const AuthContext = createContext<AppAuth>(NO_AUTH);

export function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const value = useMemo<AppAuth>(
    () => ({ enabled: true, loaded: isLoaded, signedIn: Boolean(isSignedIn), getToken: () => getToken() }),
    [isLoaded, isSignedIn, getToken],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function NoAuthBridge({ children }: { children: ReactNode }) {
  return <AuthContext.Provider value={NO_AUTH}>{children}</AuthContext.Provider>;
}

export const useAppAuth = (): AppAuth => useContext(AuthContext);
