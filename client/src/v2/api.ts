// /v2 frontend uses the shared client/src/api.ts; that module auto-detects the
// /v2 URL prefix and routes calls to /v2/api/*. Re-exported here so /v2 page
// shims can import from a v2-local path if they prefer.
export { api, setToken } from "../api";
