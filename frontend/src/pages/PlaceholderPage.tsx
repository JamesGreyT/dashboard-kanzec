import { useTranslation } from 'react-i18next'
import { Hourglass } from 'lucide-react'

export default function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center animate-fade-up">
      <div className="w-14 h-14 rounded-full bg-[#D4A843]/12 flex items-center justify-center mb-5">
        <Hourglass size={22} className="text-[#D4A843]" />
      </div>
      <h1
        className="text-2xl font-semibold text-foreground mb-2"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        {t(titleKey)}
      </h1>
      <p className="text-sm text-muted-foreground max-w-sm">
        {t('common.comingSoon')}
      </p>
    </div>
  )
}
