import { NavLink } from 'react-router-dom'
import {
  Moon, Sun, LogOut, Plus, Minus, ChevronsLeft, ChevronsRight,
  LayoutDashboard, Target, ShoppingBag, Coins, Building2, ClipboardList,
  BarChart2, Wallet, Undo2, GitCompare, Activity, Bell, Users, Shield,
} from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useAuth, type Role } from '@/context/AuthContext'
import { useLang, type Language } from '@/context/LanguageContext'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

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

const SIDEBAR_OPEN_KEY = (key: string) => `kanzec.sidebar.open.${key}`

function NavGroupSection({
  group,
  onClose,
  showDivider,
  collapsed,
}: {
  group: NavGroup
  onClose?: () => void
  showDivider: boolean
  collapsed: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return group.defaultOpen ?? true
    const stored = window.localStorage.getItem(SIDEBAR_OPEN_KEY(group.labelKey))
    if (stored === '1') return true
    if (stored === '0') return false
    return group.defaultOpen ?? true
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_OPEN_KEY(group.labelKey), open ? '1' : '0')
    } catch {
      /* ignore quota / private mode */
    }
  }, [open, group.labelKey])
  // In icon-rail mode the group header is suppressed; items always render.
  const itemsVisible = collapsed || open

  return (
    <div className="space-y-0.5">
      {/* Group rule above each section except the first */}
      {showDivider && (
        <div className={cn('h-px bg-border/40 mb-2', collapsed ? 'mx-2' : 'mx-3')} aria-hidden />
      )}
      {!collapsed && (
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
      )}
      {itemsVisible &&
        group.items.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            title={collapsed ? t(`nav.items.${labelKey}`) : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center rounded-lg text-sm transition-all duration-200',
                collapsed
                  ? 'justify-center w-10 h-10 mx-auto'
                  : 'gap-2.5 px-3 py-1.5 min-h-7',
                isActive
                  ? 'nav-active'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
              )
            }
            onClick={onClose}
          >
            <Icon size={collapsed ? 16 : 14} aria-hidden="true" className="shrink-0" />
            {!collapsed && (
              <span style={{ fontFamily: DM_SANS }} className="truncate">
                {t(`nav.items.${labelKey}`)}
              </span>
            )}
          </NavLink>
        ))}
    </div>
  )
}

const RAIL_COLLAPSED_KEY = 'kanzec.sidebar.rail.collapsed'

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { theme, toggle } = useTheme()
  const { logout, user } = useAuth()
  const { lang, setLang } = useLang()
  const { t } = useTranslation()

  const filteredGroups = visibleFor(user?.role)

  // Collapse-to-icon-rail mode (desktop only). Persisted across sessions.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(RAIL_COLLAPSED_KEY) === '1'
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])

  // Ctrl+\ toggles the icon rail
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '\\' && (e.ctrlKey || e.metaKey)) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        setCollapsed((c) => !c)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const LANGS: { code: Language; label: string }[] = [
    { code: 'uz', label: 'UZ' },
    { code: 'ru', label: 'RU' },
    { code: 'en', label: 'EN' },
  ]

  return (
    <aside
      className={cn(
        'flex flex-col h-screen overflow-y-auto bg-sidebar border-r border-border shrink-0 transition-[width] duration-200',
        // Mobile drawer always shows the full width; the collapsed flag only
        // affects the desktop layout.
        'w-[80vw] max-w-80',
        collapsed ? 'md:w-16' : 'md:w-52',
      )}
    >
      {/* Brand — soft hairline divider, generous breathing */}
      <div className={cn('flex items-center', collapsed ? 'justify-center px-2 py-5' : 'justify-between px-4 py-5')}>
        {collapsed ? (
          <span className="font-bold text-lg text-foreground" style={{ fontFamily: PLAYFAIR }}>
            K
          </span>
        ) : (
          <span className="font-bold text-base tracking-tight text-foreground" style={{ fontFamily: PLAYFAIR }}>
            Kanzec
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden md:inline-flex p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? t('common.expandSidebar') : t('common.collapseSidebar')}
          title={`${collapsed ? t('common.expandSidebar') : t('common.collapseSidebar')} (Ctrl+\\)`}
        >
          {collapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        </button>
      </div>
      <div className="h-px bg-border/40 mx-3" aria-hidden />

      {/* Navigation */}
      <nav className={cn('flex-1 py-3 space-y-2', collapsed ? 'px-2' : 'px-2')} aria-label="Main navigation">
        {filteredGroups.map((group, idx) => (
          <NavGroupSection
            key={group.labelKey}
            group={group}
            onClose={onClose}
            showDivider={idx > 0}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Footer — collapsed = avatar + theme stacked; expanded = chip + settings strip */}
      {collapsed ? (
        <div className="px-2 py-3 border-t border-border flex flex-col items-center gap-2">
          <div
            className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px] uppercase"
            title={`${user?.username ?? ''} · ${user?.role ? t(`roles.${user.role}`) : ''}`}
          >
            {user?.username?.substring(0, 2) || 'U'}
          </div>
          <button
            onClick={toggle}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t('common.toggleTheme')}
            title={t('common.toggleTheme')}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <button
            onClick={logout}
            className="p-1.5 rounded hover:bg-red-500/10 text-red-500/80 hover:text-red-500 transition-colors"
            aria-label={t('common.signOut')}
            title={t('common.signOut')}
          >
            <LogOut size={13} />
          </button>
        </div>
      ) : (
        <div className="px-3 py-3 border-t border-border flex flex-col gap-2">
          {/* User chip */}
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

          {/* Settings strip — theme + language sit on their own muted ground */}
          <div className="flex items-center justify-between gap-1 px-1.5 py-1 rounded-lg bg-accent/30">
            <button
              onClick={toggle}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              aria-label={t('common.toggleTheme')}
              title={t('common.toggleTheme')}
            >
              {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
            </button>
            <div className="flex gap-0.5">
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

          <div className="h-px bg-border/40" aria-hidden />

          {/* Sign out — pulled below a hairline so it's clearly its own action */}
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 py-1.5 text-xs font-semibold text-red-500/80 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
          >
            <LogOut size={13} />
            {t('common.signOut')}
          </button>
        </div>
      )}
    </aside>
  )
}
