import { useLayoutEffect, type ReactNode } from "react";

const V2_TARGETS = ["/teacher", "/student", "/login", "/join", "/setup", "/reset"];

function rewrite(input: string | URL | null | undefined): string | URL | null | undefined {
  if (typeof input !== "string") return input;
  if (input.startsWith("/v2")) return input;
  if (input === "/") return "/v2";
  for (const p of V2_TARGETS) {
    if (input === p || input.startsWith(p + "/") || input.startsWith(p + "?") || input.startsWith(p + "#")) {
      return "/v2" + input;
    }
  }
  return input;
}

// Intercepts react-router navigations while the user is inside /v2 so absolute
// routes like navigate("/teacher") stay under /v2/teacher.
export default function V2Wrapper({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const origPush = window.history.pushState;
    const origReplace = window.history.replaceState;

    window.history.pushState = function (state, unused, url) {
      return origPush.call(this, state, unused, rewrite(url) as any);
    };
    window.history.replaceState = function (state, unused, url) {
      return origReplace.call(this, state, unused, rewrite(url) as any);
    };

    return () => {
      window.history.pushState = origPush;
      window.history.replaceState = origReplace;
    };
  }, []);

  return <>{children}</>;
}
