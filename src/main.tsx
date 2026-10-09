import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { applyThemePresetToRoot, quartzLightTheme } from "@dev-mainsequence/command-center-sdk/theme";
// The SDK's theme, components and markdown, then the assistant's, then the application's.
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "@dev-mainsequence/command-center-sdk/theme/markdown.css";
import "@dev-mainsequence/command-center-ai/styles.css";
import "./styles.css";
import App from "./App";

applyThemePresetToRoot(document.documentElement, {
  theme: quartzLightTheme,
  // SDK controls use the input token for their border, not their background.
  resolvedTokens: { ...quartzLightTheme.tokens, input: "#C9C8CF" },
});

async function start(root: HTMLElement) {
  // On a local top-level page, `?stand-in` answers the assistant's platform and Agent runtime
  // requests from Command Center AI's scripted stand-in, with no platform and no token.
  if (import.meta.env.DEV && window.parent === window && new URLSearchParams(window.location.search).has("stand-in")) {
    const { installStandIn } = await import("./dev/stand-in");
    installStandIn();
  }
  createRoot(root).render(
    <StrictMode>
      <BrowserRouter><App /></BrowserRouter>
    </StrictMode>,
  );
}

void start(document.getElementById("root")!);
