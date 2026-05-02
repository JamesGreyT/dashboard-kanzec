import { NavLink } from 'react-router-dom'
import {
  Moon, Sun, LogOut,
  LayoutDashboard, Target, ShoppingBag, Coins, Building2, ClipboardList,
  BarChart2, Wallet, Undo2, GitCompare, Activity, Bell, Users, Shield,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useAuth, type Role } from '@/context/AuthContext'
import { useLang, type Language } from '@/context/LanguageContext'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useState } from 'react'

type NavItem = {
  to: string
  labelKey: string
  icon: React.ElementType
  adminOnly?: boolean
}

type NavGroup = {
  labelKey: string
  items: NavItem[]
  defaultOpen?: boolean
}

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'main',
    defaultOpen: true,
    items: [
      { to: '/dashboard', labelKey: 'dashboard', icon: LayoutDashboard },
    ],
  },
  {
    labelKey: 'strategic',
    defaultOpen: true,
    items: [
      { to: '/dayslice', labelKey: 'dayslice', icon: Target, adminOnly: true },
    ],
  },
  {
    labelKey: 'data',
    defaultOpen: true,
    items: [
      { to: '/data/orders', labelKey: 'orders', icon: ShoppingBag },
      { to: '/data/payments', labelKey: 'dataPayments', icon: Coins },
      { to: '/data/legal-persons', labelKey: 'legalPersons', icon: Building2 },
    ],
  },
  {
    labelKey: 'collection',
    defaultOpen: true,
    items: [
      { to: '/collection/worklist', labelKey: 'worklist', icon: ClipboardList },
    ],
  },
  {
    labelKey: 'analytics',
    defaultOpen: true,
    items: [
      { to: '/analytics/sales', labelKey: 'sales', icon: BarChart2 },
      { to: '/analytics/payments', labelKey: 'payments', icon: Wallet },
      { to: '/analytics/returns', labelKey: 'returns', icon: Undo2 },
      { to: '/analytics/comparison', labelKey: 'comparison', icon: GitCompare },
    ],
  },
  {
    labelKey: 'operations',
    defaultOpen: false,
    items: [
      { to: '/ops', labelKey: 'reports', icon: Activity, adminOnly: true },
    ],
  },
  {
    labelKey: 'admin',
    defaultOpen: false,
    items: [
      { to: '/admin/alerts', labelKey: 'alerts', icon: Bell },
      { to: '/admin/users', labelKey: 'users', icon: Users, adminOnly: true },
      { to: '/admin/audit', labelKey: 'audit', icon: Shield, adminOnly: true },
    ],
  },
]

function visibleFor(role: Role | undefined): NavGroup[] {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.adminOnly || role === 'admin'),
    }))
    .filter((group) => group.items.length > 0)
}

function NavGroupSection({ group, onClose }: { group: NavGroup; onClose?: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(group.defaultOpen ?? true)
  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {t(`nav.groups.${group.labelKey}`)}
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      {open &&
        group.items.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200',
                isActive
                  ? 'nav-active'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )
            }
            onClick={onClose}
          >
            <Icon size={14} aria-hidden="true" />
            <span style={{ fontFamily: "'DM Sans', system-ui" }}>
              {t(`nav.items.${labelKey}`)}
            </span>
          </NavLink>
        ))}
    </div>
  )
}

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { theme, toggle } = useTheme()
  const { logout, user } = useAuth()
  const { lang, setLang } = useLang()
  const { t } = useTranslation()

  const filteredGroups = visibleFor(user?.role)

  const LANGS: { code: Language; label: string }[] = [
    { code: 'uz', label: 'UZ' },
    { code: 'ru', label: 'RU' },
    { code: 'en', label: 'EN' },
  ]

  return (
    <aside className="flex flex-col w-56 h-screen overflow-y-auto bg-sidebar border-r border-border shrink-0">
      {/* Brand */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <span
          className="font-bold text-base tracking-tight text-foreground"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Kanzec
        </span>
        <button
          onClick={toggle}
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('common.toggleTheme')}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-3" aria-label="Main navigation">
        {filteredGroups.map((group) => (
          <NavGroupSection key={group.labelKey} group={group} onClose={onClose} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-border flex flex-col gap-2">
        {/* User info */}
        <div className="px-2 py-2 bg-accent/30 rounded-lg flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] uppercase">
            {user?.username?.substring(0, 2) || 'U'}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-medium truncate">{user?.username || 'User'}</p>
            <p className="text-[9px] text-muted-foreground uppercase">
              {user?.role ? t(`roles.${user.role}`) : ''}
            </p>
          </div>
        </div>

        {/* Language switcher */}
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[9px] text-muted-foreground uppercase tracking-wider shrink-0">
            {t('common.language')}
          </span>
          <div className="flex gap-0.5 ml-auto">
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={cn(
                  'px-2 py-0.5 rounded text-[10px] font-bold transition-colors',
                  lang === code
                    ? 'bg-[#D4A843] text-black'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-red-500/80 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
        >
          <LogOut size={14} />
          {t('common.signOut')}
        </button>
      </div>
    </aside>
  )
}
