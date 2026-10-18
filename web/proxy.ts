import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";

import { clerkEnabled, clerkFrontendApi } from "@/lib/auth/config";
import { buildCsp, makeNonce, SENSITIVE_PATHS } from "@/lib/csp";

const isProtected = createRouteMatcher(["/dashboard(.*)", "/admin(.*)"]);

function withSecurityHeaders(request: NextRequest): NextResponse {
  const nonce = makeNonce();
  const csp = buildCsp({ nonce, dev: process.env.NODE_ENV === "development", clerkHost: clerkFrontendApi() });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp); // Next.js reads the nonce from here while rendering
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  if (SENSITIVE_PATHS.test(request.nextUrl.pathname)) {
    response.headers.set("cache-control", "no-store, max-age=0");
  }
  return response;
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isProtected(request)) await auth.protect(); // FastAPI re-verifies every token; this only redirects early
  return withSecurityHeaders(request);
});

export default clerkEnabled ? withClerk : withSecurityHeaders;

export const config = {
  matcher: [
    // Everything except Next internals, static files, and the routes Caddy sends straight to FastAPI.
    "/((?!_next|api/v2|quantum-|\\.well-known/quantumpass-keys\\.json|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|txt|webmanifest)).*)",
  ],
};
