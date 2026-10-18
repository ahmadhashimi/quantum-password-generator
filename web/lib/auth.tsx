"use client";
import { createContext, useContext, type ReactNode } from "react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import type { TokenGetter } from "./api";

export const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
interface AuthState {
  enabled: boolean; loaded: boolean; signedIn: boolean; getToken: TokenGetter;
}
const noAuth: AuthState = { enabled: false, loaded: true, signedIn: false, getToken: async () => null };
const AuthContext = createContext<AuthState>(noAuth);
function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  return <AuthContext.Provider value={{
    enabled: true, loaded: isLoaded, signedIn: !!isSignedIn, getToken: () => getToken(),
  }}>{children}</AuthContext.Provider>;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!CLERK_KEY) return <AuthContext.Provider value={noAuth}>{children}</AuthContext.Provider>;
  return <ClerkProvider publishableKey={CLERK_KEY}>
    <ClerkBridge>{children}</ClerkBridge>
  </ClerkProvider>;
}
export const useAppAuth = () => useContext(AuthContext);
