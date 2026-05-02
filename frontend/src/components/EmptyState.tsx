import { Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: React.ReactNode
}

export default function EmptyState({ title, description, icon }: EmptyStateProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        {icon || <Inbox size={24} className="text-muted-foreground" />}
      </div>
      <p className="text-sm font-medium text-foreground mb-1">{title || t('common.noData')}</p>
      {description && <p className="text-xs text-muted-foreground max-w-xs">{description}</p>}
    </div>
  )
}
