import { applyThemePresetToRoot, mainSequenceTheme, quartzLightTheme } from "@dev-mainsequence/command-center-sdk/theme";
export function applyRuntimeTestTheme(dark: boolean) {
  applyThemePresetToRoot(document.documentElement, { theme: dark ? mainSequenceTheme : quartzLightTheme });
}
