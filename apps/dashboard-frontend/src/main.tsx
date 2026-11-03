import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// The dashboard API is token-protected. Reuse one token for every component
// (the built-in dashboard asks for the same token via localStorage).
const TOKEN_KEY = "cowork_dashboard_token";
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith("/api/")) return nativeFetch(input, init);
  let token = localStorage.getItem(TOKEN_KEY) ?? "";
  if (!token) {
    token = window.prompt("Dashboard bearer token (printed by `bun run dashboard`):") ?? "";
    localStorage.setItem(TOKEN_KEY, token);
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await nativeFetch(input, { ...init, headers });
  if (response.status === 401) localStorage.removeItem(TOKEN_KEY);
  return response;
};
