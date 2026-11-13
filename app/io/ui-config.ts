// Local UI settings served by the dev server (scripts/ui-config-plugin.mjs) from <data dir>/config.json.
// Without that route (a plain production build) the app keeps its English default.
export const UI_CONFIG_PATH = "/api/ui-config";

export async function fetchUiConfig(): Promise<{ locale: string }> {
  try {
    const response = await fetch(UI_CONFIG_PATH, { cache: "no-store" });
    if (!response.ok) return { locale: "en" };
    const body = await response.json();
    return { locale: typeof body?.locale === "string" ? body.locale : "en" };
  } catch {
    return { locale: "en" };
  }
}
