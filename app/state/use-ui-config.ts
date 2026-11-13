import { useEffect, useState } from "react";
import { setUiLocale } from "../domain/i18n";
import { fetchUiConfig } from "../io/ui-config";

/** Loads the local UI settings once; the app waits for them so the first canvas already uses the configured locale. */
export function useUiConfig() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchUiConfig().then(({ locale }) => {
      if (cancelled) return;
      setUiLocale(locale);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready;
}
