import assert from "node:assert/strict";
import test from "node:test";
import { authGateDecision, isPublicPath } from "../src/auth/authGatePolicy.ts";

test("only the landing and sign-in pages are public", () => {
  assert.equal(isPublicPath("/willkommen"), true);
  assert.equal(isPublicPath("/anmelden"), true);
  assert.equal(isPublicPath("/anmelden/bestaetigen"), true);
  assert.equal(isPublicPath("/"), false);
  assert.equal(isPublicPath("/willkommenx"), false);
  assert.equal(isPublicPath("/training/vscode-basics"), false);
});

test("a protected route still mounted on the way to the landing page is never shown (#563)", () => {
  const decision = authGateDecision({
    status: "anonymous",
    targetPathname: "/willkommen",
    renderedPathname: "/",
  });
  assert.deepEqual(decision, { view: "redirecting", redirectToLanding: false });
});

test("an anonymous visitor on a protected route is redirected without seeing it", () => {
  assert.deepEqual(
    authGateDecision({ status: "anonymous", targetPathname: "/", renderedPathname: "/" }),
    { view: "redirecting", redirectToLanding: true },
  );
});

test("the session check never shows protected content while it is pending", () => {
  for (const [targetPathname, renderedPathname] of [
    ["/", "/"],
    ["/kompetenz", "/willkommen"],
    ["/willkommen", "/kompetenz"],
  ]) {
    assert.deepEqual(
      authGateDecision({ status: "loading", targetPathname, renderedPathname }),
      { view: "checking", redirectToLanding: false },
      `${renderedPathname} -> ${targetPathname}`,
    );
  }
});

test("public pages render independently of the session bootstrap", () => {
  for (const status of ["loading", "anonymous", "authenticated"] as const) {
    assert.deepEqual(
      authGateDecision({ status, targetPathname: "/anmelden", renderedPathname: "/willkommen" }),
      { view: "content", redirectToLanding: false },
      status,
    );
  }
});

test("an authenticated session sees every route, including during navigation", () => {
  assert.deepEqual(
    authGateDecision({
      status: "authenticated",
      targetPathname: "/",
      renderedPathname: "/anmelden",
    }),
    { view: "content", redirectToLanding: false },
  );
});
