// One bundle for the locale tests, so the spec loader and the locale store share a module instance.
export { getUiLocale, setUiLocale, t } from "../../app/domain/i18n";
export { loadDiagramSpec } from "../../app/domain/spec/load-graph";
