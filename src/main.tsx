import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { applyThemePresetToRoot, quartzLightTheme } from "@dev-mainsequence/command-center-sdk/theme";
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
import "./styles.css";
import App from "./App";

applyThemePresetToRoot(document.documentElement, { theme: quartzLightTheme });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </StrictMode>,
);
