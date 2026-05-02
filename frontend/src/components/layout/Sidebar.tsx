import { NavLink } from 'react-router-dom'
import {
  Moon, Sun, LogOut, Plus, Minus,
  LayoutDashboard, Target, ShoppingBag, Coins, Building2, ClipboardList,
  BarChart2, Wallet, Undo2, GitCompare, Activity, Bell, Users, Shield,
} from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useAuth, type Role } from '@/context/AuthContext'
import { useLang, type Language } from '@/context/LanguageContext'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"

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

function NavGroupSection({
  group,
  onClose,
  showDivider,
}: {
  group: NavGroup
  onClose?: () => void
  showDivider: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(group.defaultOpen ?? true)
  return (
    <div className="space-y-0.5">
      {/* Group rule above each section except the first */}
      {showDivider && (
        <div className="h-px bg-border/40 mx-3 mb-2" aria-hidden />
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-1 rounded text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80 hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <span>{t(`nav.groups.${group.labelKey}`)}</span>
        <span className="text-muted-foreground/40">
          {open ? <Minus size={10} /> : <Plus size={10} />}
        </span>
      </button>
      {open &&
        group.items.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 px-3 py-1.5 min-h-7 rounded-lg text-sm transition-all duration-200',
                isActive
                  ? 'nav-active'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )
            }
            onClick={onClose}
          >
            <Icon size={14} aria-hidden="true" className="shrink-0" />
            <span style={{ fontFamily: DM_SANS }} className="truncate">
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
    <aside className="flex flex-col w-[80vw] max-w-80 md:w-52 h-screen overflow-y-auto bg-sidebar border-r border-border shrink-0">
      {/* Brand — no theme toggle here, that moves to the footer */}
      <div className="px-4 py-4 border-b border-border">
        <span
          className="font-bold text-base tracking-tight text-foreground"
          style={{ fontFamily: PLAYFAIR }}
        >
          Kanzec
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-2" aria-label="Main navigation">
        {filteredGroups.map((group, idx) => (
          <NavGroupSection
            key={group.labelKey}
            group={group}
            onClose={onClose}
            showDivider={idx > 0}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border flex flex-col gap-2">
        {/* User chip — compressed to one row, ~32px tall */}
        <div className="flex items-center gap-2 px-1.5 py-1">
          <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[9px] uppercase shrink-0">
            {user?.username?.substring(0, 2) || 'U'}
          </div>
          <p className="text-xs truncate" style={{ fontFamily: DM_SANS }}>
            <span className="font-medium">{user?.username || 'User'}</span>
            {user?.role && (
              <span className="text-muted-foreground">
                {' · '}
                {t(`roles.${user.role}`)}
              </span>
            )}
          </p>
        </div>

        {/* Theme toggle + language pills, sharing one row */}
        <div className="flex items-center gap-1 px-1">
          <button
            onClick={toggle}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('common.toggleTheme')}
            title={t('common.toggleTheme')}
          >
            {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
          </button>
          <div className="flex gap-0.5 ml-auto">
            {LANGS.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => setLang(code)}
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors',
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
          className="w-full flex items-center justify-center gap-2 py-1.5 text-xs font-semibold text-red-500/80 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
        >
          <LogOut size={13} />
          {t('common.signOut')}
        </button>
      </div>
    </aside>
  )
}
