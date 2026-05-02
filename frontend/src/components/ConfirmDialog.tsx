import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open, title, description, confirmLabel, cancelLabel, variant = 'danger', onConfirm, onCancel
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  const isDanger = variant === 'danger'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl max-w-sm w-full p-6 animate-fade-up">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDanger ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
            <AlertTriangle size={20} className={isDanger ? 'text-red-500' : 'text-amber-500'} />
          </div>
          <div>
            <h3 id="confirm-title" className="text-sm font-semibold text-foreground">{title}</h3>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-muted text-foreground hover:bg-accent transition-colors"
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${isDanger ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
          >
            {confirmLabel || t('common.confirm', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
