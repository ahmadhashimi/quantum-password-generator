import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
const isPrivate = createRouteMatcher(["/dashboard(.*)", "/admin(.*)"]);
export default clerkMiddleware(async (auth, req) => {
  if (isPrivate(req)) await auth.protect();
});
export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|woff2?|ttf|map)).*)", "/(api|trpc)(.*)"],
};
