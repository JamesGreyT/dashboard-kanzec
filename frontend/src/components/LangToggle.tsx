import { useTranslation } from "react-i18next";
import { Lang, LANG_STORAGE_KEY } from "../i18n";

/**
 * Three-way language switch: UZ · RU · EN.
 * Rendered in the sidebar footer and on the login masthead.
 * Active side is underlined in vermilion; others sit as ink-3 text links.
 */
export default function LangToggle({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage as Lang) || "en";

  function set(lang: Lang) {
    void i18n.changeLanguage(lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* no-op */
    }
  }

  const opt = (lang: Lang, label: string) => (
    <button
      type="button"
      onClick={() => set(lang)}
      aria-pressed={current === lang}
      className={[
        "caption transition-colors",
        current === lang
          ? "text-mark underline decoration-mark underline-offset-[3px]"
          : "text-ink-3 hover:text-ink",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {opt("uz", "UZ")}
      <span className="text-ink-3">·</span>
      {opt("ru", "RU")}
      <span className="text-ink-3">·</span>
      {opt("en", "EN")}
    </div>
  );
}
