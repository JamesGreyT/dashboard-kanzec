import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import i18n from '@/i18n'

export type Language = 'uz' | 'ru' | 'en'

interface LanguageCtx {
  lang: Language
  setLang: (l: Language) => void
}

const LanguageContext = createContext<LanguageCtx>({
  lang: 'uz',
  setLang: () => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(
    () => (localStorage.getItem('kanzec_lang') as Language) ?? 'uz'
  )

  useEffect(() => {
    i18n.changeLanguage(lang)
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (l: Language) => {
    setLangState(l)
    localStorage.setItem('kanzec_lang', l)
    i18n.changeLanguage(l)
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLang() {
  return useContext(LanguageContext)
}
