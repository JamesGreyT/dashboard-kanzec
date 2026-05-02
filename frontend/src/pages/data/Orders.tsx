import { useTranslation } from 'react-i18next'
import DataViewer from '@/components/DataViewer'

export default function OrdersPage() {
  const { t } = useTranslation()
  return <DataViewer tableKey="deal_order" title={t('nav.items.orders')} />
}
