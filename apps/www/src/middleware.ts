import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/**
 * Deliberately `middleware.ts` and not Next 16's `proxy.ts`: proxy runs on the
 * Node runtime only, and this app deploys to Cloudflare Workers, which needs
 * the edge entry point. The hub made the same call for the same reason.
 */
export default createMiddleware(routing);

export const config = {
  // Everything except Next internals, the API surface and static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
