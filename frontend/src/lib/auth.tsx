import { createContext, useContext, type ReactNode } from "react";
import { ClerkProvider, useAuth } from "@clerk/react";
import type { TokenGetter } from "./api";

export const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

interface AuthState {
  enabled: boolean;
  loaded: boolean;
  signedIn: boolean;
  getToken: TokenGetter;
}

const noAuth: AuthState = { enabled: false, loaded: true, signedIn: false, getToken: async () => null };
const AuthContext = createContext<AuthState>(noAuth);

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const value: AuthState = { enabled: true, loaded: isLoaded, signedIn: !!isSignedIn, getToken: () => getToken() };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Wraps the app in Clerk when a publishable key is configured; otherwise runs without accounts. */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!CLERK_KEY) return <AuthContext.Provider value={noAuth}>{children}</AuthContext.Provider>;
  return (
    <ClerkProvider
      publishableKey={CLERK_KEY}
      afterSignOutUrl="/"
      appearance={{
        variables: { colorPrimary: "#06b6d4", borderRadius: "0.75rem", fontFamily: "Inter, ui-sans-serif, system-ui" },
      }}
    >
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}

export const useAppAuth = () => useContext(AuthContext);
