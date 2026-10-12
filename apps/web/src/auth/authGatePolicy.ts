import type { AuthStatus } from "./AuthContext";

/**
 * Routes that anonymous visitors may reach. Everything else is redirected to
 * the public landing page, which is the entry point for people who do not have
 * a learning account yet.
 */
export const PUBLIC_PATHS = ["/willkommen", "/anmelden"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export type AuthGateView = "content" | "checking" | "redirecting";

export interface AuthGateInput {
  status: AuthStatus;
  /** Where the router is going: the location of the navigation in progress. */
  targetPathname: string;
  /** What the router still shows: the location whose route matches are mounted. */
  renderedPathname: string;
}

export interface AuthGateDecision {
  view: AuthGateView;
  redirectToLanding: boolean;
}

/**
 * Decides what the gate shows.
 *
 * During a navigation the router reports the target location before it has mounted the target
 * route. On the way from a protected route to the landing page the target is public while the
 * protected page is still what `<Outlet />` renders. Content therefore bypasses the session check
 * only when both locations are public; otherwise a signed-out visitor briefly sees the platform
 * (#563).
 */
export function authGateDecision({
  status,
  targetPathname,
  renderedPathname,
}: AuthGateInput): AuthGateDecision {
  const redirectToLanding = status === "anonymous" && !isPublicPath(targetPathname);

  if (status === "authenticated") return { view: "content", redirectToLanding };
  if (isPublicPath(targetPathname) && isPublicPath(renderedPathname)) {
    return { view: "content", redirectToLanding };
  }
  return { view: status === "loading" ? "checking" : "redirecting", redirectToLanding };
}
