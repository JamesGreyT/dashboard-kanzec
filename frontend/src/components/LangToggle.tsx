import { useTranslation } from "react-i18next";
import { Lang, LANG_STORAGE_KEY } from "../i18n";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LangToggle({ className = "" }: { className?: string }) {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage as Lang) || "en";

  function set(lang: string) {
    void i18n.changeLanguage(lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      /* no-op */
    }
  }

  return (
    <Tabs value={current} onValueChange={set} className={className}>
      <TabsList className="h-8">
        <TabsTrigger value="uz" className="px-2 text-xs">UZ</TabsTrigger>
        <TabsTrigger value="ru" className="px-2 text-xs">RU</TabsTrigger>
        <TabsTrigger value="en" className="px-2 text-xs">EN</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
