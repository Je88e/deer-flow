/**
 * The app's fixed base path (mirrors `basePath` in next.config.js).
 *
 * Browser routes and Next-rendered DOM hrefs (next/link adds the prefix to
 * the rendered attribute) carry this prefix, so `page.goto` targets and href
 * assertions/selectors must include it. `page.route()` interceptions use
 * `**`-globs or regexes and stay prefix-agnostic.
 */
export const BASE = "/leadagent";
