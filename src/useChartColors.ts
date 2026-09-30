import { useEffect, useState } from "react";
import { quartzLightTheme, resolveCommandCenterThemeById } from "@dev-mainsequence/command-center-sdk/theme";
import { getThemeCategoricalPalette, resolveThemeDataVizPalette } from "@dev-mainsequence/command-center-sdk/theme/data-viz";

/** Domain renderers consume the SDK palette of the currently applied preset. */
export function useChartColors() {
  function readPalette() {
    const theme = (typeof document !== "undefined" && resolveCommandCenterThemeById(document.documentElement.dataset.theme ?? "")) || quartzLightTheme;
    return getThemeCategoricalPalette(resolveThemeDataVizPalette(theme, theme.tokens), 2);
  }
  const [colors, setColors] = useState(readPalette);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    setColors(readPalette());
    return () => observer.disconnect();
  }, []);
  return colors;
}
