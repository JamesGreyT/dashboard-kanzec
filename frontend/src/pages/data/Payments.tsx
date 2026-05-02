import { useTranslation } from 'react-i18next'
import DataViewer from '@/components/DataViewer'

export default function PaymentsPage() {
  const { t } = useTranslation()
  return <DataViewer tableKey="payment" title={t('nav.items.dataPayments')} />
}
