import { useTranslation } from 'react-i18next'
import DataViewer from '@/components/DataViewer'

export default function LegalPersonsPage() {
  const { t } = useTranslation()
  return <DataViewer tableKey="legal_person" title={t('nav.items.legalPersons')} editable />
}
