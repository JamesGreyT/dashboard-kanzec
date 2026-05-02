import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

import { queryClient } from '@/api/queryClient'
import { ThemeProvider } from '@/context/ThemeContext'
import { LanguageProvider } from '@/context/LanguageContext'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import Layout from '@/components/layout/Layout'
import Login from '@/pages/Login'
import PlaceholderPage from '@/pages/PlaceholderPage'
import Dashboard from '@/pages/Dashboard'
import OrdersPage from '@/pages/data/Orders'
import PaymentsDataPage from '@/pages/data/Payments'
import LegalPersonsPage from '@/pages/data/LegalPersons'

function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center text-muted-foreground">
        <div className="animate-spin w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full" />
      </div>
    )
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

function AdminRoute() {
  const { user } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'admin') return <Outlet />

  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center p-8 animate-fade-up">
      <div className="glass-card p-8 rounded-2xl max-w-sm flex flex-col items-center">
        <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle size={24} />
        </div>
        <h2
          className="text-xl font-bold mb-2"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          {t('common.accessDenied')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('common.accessDeniedDesc')} <code className="text-foreground">{location.pathname}</code>
        </p>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<Layout />}>
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />

                    <Route path="/data/orders" element={<OrdersPage />} />
                    <Route path="/data/payments" element={<PaymentsDataPage />} />
                    <Route path="/data/legal-persons" element={<LegalPersonsPage />} />

                    <Route path="/collection/worklist" element={<PlaceholderPage titleKey="nav.items.worklist" />} />
                    <Route path="/collection/debt/client/:personId" element={<PlaceholderPage titleKey="nav.items.worklist" />} />

                    <Route path="/analytics/sales" element={<PlaceholderPage titleKey="nav.items.sales" />} />
                    <Route path="/analytics/payments" element={<PlaceholderPage titleKey="nav.items.payments" />} />
                    <Route path="/analytics/returns" element={<PlaceholderPage titleKey="nav.items.returns" />} />
                    <Route path="/analytics/comparison" element={<PlaceholderPage titleKey="nav.items.comparison" />} />

                    <Route path="/admin/alerts" element={<PlaceholderPage titleKey="nav.items.alerts" />} />

                    {/* Admin-only */}
                    <Route element={<AdminRoute />}>
                      <Route path="/dayslice" element={<PlaceholderPage titleKey="nav.items.dayslice" />} />
                      <Route path="/ops" element={<PlaceholderPage titleKey="nav.items.reports" />} />
                      <Route path="/admin/users" element={<PlaceholderPage titleKey="nav.items.users" />} />
                      <Route path="/admin/audit" element={<PlaceholderPage titleKey="nav.items.audit" />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
