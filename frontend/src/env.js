import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    GITHUB_OAUTH_TOKEN: z.string().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_BACKEND_BASE_URL: z.string().optional(),
    NEXT_PUBLIC_LANGGRAPH_BASE_URL: z.string().optional(),
    NEXT_PUBLIC_STATIC_WEBSITE_ONLY: z.string().optional(),
    // Full origin of the WIT Shell host when DeerFlow is embedded in a Shell
    // iframe (postMessage targetOrigin / inbound origin check).
    NEXT_PUBLIC_SHELL_ORIGIN: z.string().optional(),
    // Base path DeerFlow is served under (must match next.config.js basePath,
    // e.g. "/leadagent"); "" means a root deployment.
    NEXT_PUBLIC_BASE_PATH: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,

    NEXT_PUBLIC_BACKEND_BASE_URL: process.env.NEXT_PUBLIC_BACKEND_BASE_URL,
    NEXT_PUBLIC_LANGGRAPH_BASE_URL: process.env.NEXT_PUBLIC_LANGGRAPH_BASE_URL,
    NEXT_PUBLIC_STATIC_WEBSITE_ONLY:
      process.env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY,
    NEXT_PUBLIC_SHELL_ORIGIN: process.env.NEXT_PUBLIC_SHELL_ORIGIN,
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_PUBLIC_BASE_PATH,
    GITHUB_OAUTH_TOKEN: process.env.GITHUB_OAUTH_TOKEN,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});

/**
 * The app's base path ("" on a root deployment, "/leadagent" when served
 * under a prefix). next.config.js inlines NEXT_PUBLIC_BASE_PATH to match its
 * own `basePath`, so this stays correct in client bundles without operators
 * setting anything. Raw browser APIs (window.location, CSS url(), WebSocket
 * URLs) do NOT apply Next's basePath automatically — prefix them with this.
 */
export function basePath() {
  return env.NEXT_PUBLIC_BASE_PATH ?? "";
}

/**
 * Prefix for Gateway REST API requests, served under the app's base path.
 * Concatenate request paths onto it, e.g. `apiBase() + "/v1/auth/logout"`
 * resolves to "/leadagent/api/v1/auth/logout" under a "/leadagent" base path
 * and to "/api/v1/auth/logout" on a root deployment.
 */
export function apiBase() {
  return `${basePath()}/api`;
}
