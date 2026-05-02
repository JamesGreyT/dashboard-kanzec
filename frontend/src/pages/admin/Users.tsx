import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Edit2, Trash2, Save, X, Key, Users as UsersIcon, AlertTriangle, Copy, Check } from 'lucide-react'

import PageHeader from '@/components/PageHeader'
import {
  useAdminUsers,
  useAdminRooms,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useRevokeUserSessions,
  useBulkUsersFromRooms,
  type AdminUser,
  type BulkFromRoomsResult,
} from '@/api/hooks'
import { useAuth, type Role } from '@/context/AuthContext'
import { formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

const PLAYFAIR = "'Playfair Display', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui"
const PLEX_MONO = "'IBM Plex Mono', ui-monospace, monospace"

const ROLE_BADGE: Record<Role, string> = {
  admin: 'critical',
  operator: 'plan',
  viewer: 'monitor',
}

export default function Users() {
  const { t, i18n } = useTranslation()
  const { user: me } = useAuth()
  const usersQ = useAdminUsers()
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null)

  return (
    <div>
      <PageHeader />

      <header className="mb-6">
        <span className="section-title">{t('admin.section')}</span>
        <div className="flex items-end justify-between gap-4 mt-3 flex-wrap">
          <h1
            className="text-3xl lg:text-4xl font-semibold leading-none tracking-tight"
            style={{ fontFamily: PLAYFAIR }}
          >
            {t('admin.users.title')}
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="month-btn inline-flex items-center gap-1.5 normal-case"
            >
              <UsersIcon size={11} />
              {t('admin.users.bulkFromRooms')}
            </button>
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="px-3 py-1.5 rounded-lg bg-[#D4A843] hover:bg-[#C49833] text-black text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              style={{ fontFamily: DM_SANS }}
            >
              <Plus size={12} />
              {t('admin.users.newUser')}
            </button>
          </div>
        </div>
      </header>

      <div className="overflow-x-auto -mx-2 animate-fade-up animate-fade-up-delay-2">
        <table className="premium-table w-full text-sm" style={{ fontFamily: DM_SANS }}>
          <thead>
            <tr>
              <Th label={t('admin.users.cols.username')} />
              <Th label={t('admin.users.cols.role')} />
              <Th label={t('admin.users.cols.scope')} />
              <Th label={t('admin.users.cols.active')} />
              <Th label={t('admin.users.cols.lastLogin')} />
              <Th label={t('admin.users.cols.created')} />
              <Th label="" align="right" />
            </tr>
          </thead>
          <tbody>
            {usersQ.isLoading && !usersQ.data
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-3 py-2.5 border-b border-border/40">
                        <div className="shimmer-skeleton h-3 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : (usersQ.data ?? []).map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2.5 border-b border-border/40">
                      <span style={{ fontFamily: PLAYFAIR, fontWeight: 600 }}>{u.username}</span>
                      {me?.id === u.id && (
                        <span className="ml-2 text-[10px] text-muted-foreground italic">({t('admin.users.you')})</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40">
                      <span className={`action-badge ${ROLE_BADGE[u.role] ?? 'plan'}`}>{t(`roles.${u.role}`)}</span>
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40 text-muted-foreground text-xs">
                      {u.role === 'admin' ? t('admin.users.allRooms') : `${u.scope_room_ids.length} ${t('admin.users.rooms')}`}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40">
                      {u.is_active ? (
                        <span className="action-badge monitor">{t('admin.users.active')}</span>
                      ) : (
                        <span className="action-badge critical">{t('admin.users.inactive')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40 text-xs text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                      {u.last_login_at ? formatShortDate(u.last_login_at, i18n.language) : <span className="cell-empty">—</span>}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40 text-xs text-muted-foreground" style={{ fontFamily: PLEX_MONO }}>
                      {formatShortDate(u.created_at, i18n.language)}
                    </td>
                    <td className="px-3 py-2.5 border-b border-border/40 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(u)}
                        className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-[#9E7B2F] transition-colors mr-3"
                      >
                        <Edit2 size={11} className="inline mr-0.5" />
                        {t('common.edit')}
                      </button>
                      {me?.id !== u.id && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(u)}
                          className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={11} className="inline mr-0.5" />
                          {t('common.delete')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <UserModal
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {bulkOpen && <BulkFromRoomsModal onClose={() => setBulkOpen(false)} />}
      {confirmDelete && (
        <ConfirmDeleteModal user={confirmDelete} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  )
}

function Th({ label, align = 'left' }: { label: string; align?: 'left' | 'right' }) {
  return (
    <th className={cn('px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border', align === 'right' ? 'text-right' : 'text-left')}>
      {label}
    </th>
  )
}

// ── User create/edit modal ───────────────────────────────────────────────

function UserModal({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { t } = useTranslation()
  const create = useCreateUser()
  const update = useUpdateUser()
  const revoke = useRevokeUserSessions()
  const roomsQ = useAdminRooms()

  const [username, setUsername] = useState(user?.username ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>(user?.role ?? 'operator')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [scopeRoomIds, setScopeRoomIds] = useState<string[]>(user?.scope_room_ids ?? [])
  const [error, setError] = useState<string | null>(null)
  const [revoked, setRevoked] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (user) {
        await update.mutateAsync({
          id: user.id,
          payload: {
            ...(password ? { password } : {}),
            role,
            is_active: isActive,
            scope_room_ids: role === 'admin' ? [] : scopeRoomIds,
          },
        })
      } else {
        if (!password) { setError(t('admin.users.passwordRequired')); return }
        await create.mutateAsync({
          username: username.trim(),
          password,
          role,
          scope_room_ids: role === 'admin' ? [] : scopeRoomIds,
        })
      }
      onClose()
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail ?? (status === 409 ? t('admin.users.usernameTaken') : t('admin.users.saveFailed')))
    }
  }

  async function onRevoke() {
    if (!user) return
    await revoke.mutateAsync(user.id)
    setRevoked(true)
    setTimeout(() => setRevoked(false), 2000)
  }

  return (
    <ModalShell onClose={onClose} title={user ? t('admin.users.edit') : t('admin.users.newUser')}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t('admin.users.cols.username')}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!!user}
            required
            className="inv-filter w-full"
            style={{ fontFamily: DM_SANS }}
          />
        </Field>

        <Field label={user ? t('admin.users.newPassword') : t('admin.users.password')}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={user ? t('admin.users.leaveBlank') : ''}
            required={!user}
            minLength={8}
            className="inv-filter w-full"
            style={{ fontFamily: DM_SANS }}
          />
        </Field>

        <Field label={t('admin.users.cols.role')}>
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="inv-filter w-full">
            <option value="admin">{t('roles.admin')}</option>
            <option value="operator">{t('roles.operator')}</option>
            <option value="viewer">{t('roles.viewer')}</option>
          </select>
        </Field>

        {user && (
          <Field label={t('admin.users.cols.active')}>
            <label className="inline-flex items-center gap-2 text-sm" style={{ fontFamily: DM_SANS }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {isActive ? t('admin.users.active') : t('admin.users.inactive')}
            </label>
          </Field>
        )}

        {role !== 'admin' && (
          <Field label={t('admin.users.scopeRooms')}>
            <div className="max-h-40 overflow-y-auto border border-border rounded-md p-2 space-y-1 bg-input">
              {(roomsQ.data ?? []).filter((r) => r.active).map((room) => (
                <label key={room.room_id} className="flex items-center gap-2 text-xs" style={{ fontFamily: DM_SANS }}>
                  <input
                    type="checkbox"
                    checked={scopeRoomIds.includes(room.room_id)}
                    onChange={(e) => {
                      if (e.target.checked) setScopeRoomIds([...scopeRoomIds, room.room_id])
                      else setScopeRoomIds(scopeRoomIds.filter((id) => id !== room.room_id))
                    }}
                  />
                  <span>{room.room_name}</span>
                  <span className="text-muted-foreground/60 ml-auto">{room.clients_count}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground italic">
              {scopeRoomIds.length === 0 ? t('admin.users.scopeWarning') : `${scopeRoomIds.length} ${t('admin.users.rooms')}`}
            </p>
          </Field>
        )}

        {user && (
          <div className="pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={onRevoke}
              disabled={revoke.isPending || revoked}
              className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-[#9E7B2F] transition-colors inline-flex items-center gap-1"
            >
              <Key size={10} />
              {revoked ? t('admin.users.revoked') : t('admin.users.revokeSessions')}
            </button>
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-start gap-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={create.isPending || update.isPending}
            className="text-xs px-3.5 py-1.5 rounded bg-[#D4A843] hover:bg-[#C49833] disabled:bg-[#D4A843]/30 disabled:cursor-not-allowed text-black font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <Save size={11} />
            {create.isPending || update.isPending ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ── Delete confirm modal ─────────────────────────────────────────────────

function ConfirmDeleteModal({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { t } = useTranslation()
  const del = useDeleteUser()
  const [error, setError] = useState<string | null>(null)
  async function onConfirm() {
    try {
      await del.mutateAsync(user.id)
      onClose()
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail ?? t('admin.users.deleteFailed'))
    }
  }
  return (
    <ModalShell onClose={onClose} title={t('admin.users.deleteTitle')}>
      <p className="text-sm mb-5" style={{ fontFamily: DM_SANS }}>
        {t('admin.users.deleteConfirm', { username: user.username })}
      </p>
      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs mb-3">
          {error}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={del.isPending}
          className="text-xs px-3.5 py-1.5 rounded bg-red-500 hover:bg-red-600 disabled:bg-red-500/30 text-white font-semibold transition-colors"
        >
          {t('common.delete')}
        </button>
      </div>
    </ModalShell>
  )
}

// ── Bulk-from-rooms modal ────────────────────────────────────────────────

function BulkFromRoomsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const mut = useBulkUsersFromRooms()
  const [role, setRole] = useState<'operator' | 'viewer'>('operator')
  const [skipExisting, setSkipExisting] = useState(true)
  const [resetExisting, setResetExisting] = useState(false)
  const [results, setResults] = useState<BulkFromRoomsResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit() {
    setError(null)
    try {
      const data = await mut.mutateAsync({
        role,
        skip_existing_usernames: skipExisting,
        reset_existing: resetExisting,
      })
      setResults(data)
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setError(detail ?? t('admin.users.bulkFailed'))
    }
  }

  if (results) {
    return (
      <ModalShell onClose={onClose} title={t('admin.users.bulkResult')}>
        <p className="text-sm mb-3" style={{ fontFamily: DM_SANS }}>
          {t('admin.users.bulkCreated', { count: results.length })}
        </p>
        <div className="bg-[#FBBF24]/10 border border-[#FBBF24]/30 rounded-lg p-3 mb-4 text-xs" style={{ fontFamily: DM_SANS }}>
          <strong className="text-[#9E7B2F]">⚠ {t('admin.users.bulkWarning')}</strong>
          <p className="mt-1 text-muted-foreground">{t('admin.users.bulkWarningDesc')}</p>
        </div>
        <div className="max-h-80 overflow-y-auto border border-border rounded-md">
          <table className="w-full text-xs" style={{ fontFamily: DM_SANS }}>
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t('admin.users.cols.username')}</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t('admin.users.tempPassword')}</th>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{t('admin.users.room')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <BulkResultRow key={r.username} result={r} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-[#D4A843] hover:bg-[#C49833] text-black font-semibold transition-colors"
          >
            {t('common.close')}
          </button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell onClose={onClose} title={t('admin.users.bulkFromRooms')}>
      <p className="text-sm text-muted-foreground mb-5" style={{ fontFamily: DM_SANS }}>
        {t('admin.users.bulkDesc')}
      </p>
      <div className="space-y-3">
        <Field label={t('admin.users.cols.role')}>
          <select value={role} onChange={(e) => setRole(e.target.value as 'operator' | 'viewer')} className="inv-filter w-full">
            <option value="operator">{t('roles.operator')}</option>
            <option value="viewer">{t('roles.viewer')}</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm" style={{ fontFamily: DM_SANS }}>
          <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
          {t('admin.users.skipExisting')}
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ fontFamily: DM_SANS }}>
          <input type="checkbox" checked={resetExisting} onChange={(e) => setResetExisting(e.target.checked)} disabled={skipExisting} />
          <span className={skipExisting ? 'text-muted-foreground/50' : ''}>{t('admin.users.resetExisting')}</span>
        </label>
      </div>
      {error && (
        <div className="px-3 py-2 mt-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2 mt-5">
        <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors">
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={mut.isPending}
          className="text-xs px-3.5 py-1.5 rounded bg-[#D4A843] hover:bg-[#C49833] disabled:bg-[#D4A843]/30 text-black font-semibold transition-colors"
        >
          {mut.isPending ? t('common.loading') : t('admin.users.runBulk')}
        </button>
      </div>
    </ModalShell>
  )
}

function BulkResultRow({ result }: { result: BulkFromRoomsResult }) {
  const [copied, setCopied] = useState(false)
  return (
    <tr className="border-b border-border/30">
      <td className="px-3 py-1.5" style={{ fontFamily: PLEX_MONO }}>{result.username}</td>
      <td className="px-3 py-1.5">
        <div className="inline-flex items-center gap-2">
          <code className="text-xs">{result.temp_password}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(result.temp_password)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="text-muted-foreground hover:text-[#9E7B2F] transition-colors"
            aria-label="copy"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
          </button>
        </div>
      </td>
      <td className="px-3 py-1.5 text-muted-foreground">{result.room_name}</td>
    </tr>
  )
}

// ── Modal shell ──────────────────────────────────────────────────────────

function ModalShell({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/30" onClick={onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-card border border-border rounded-xl p-6 lg:p-7 shadow-xl animate-fade-up max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-semibold leading-none" style={{ fontFamily: PLAYFAIR }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1.5" style={{ fontFamily: DM_SANS }}>
        {label}
      </span>
      {children}
    </label>
  )
}
