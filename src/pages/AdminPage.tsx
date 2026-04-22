import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'

import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiFetchJson } from '@/lib/api'
import {
  getAdminPermissionGroupName,
  getApiBaseUrl,
  getDefaultPermissionGroupName,
  isUiAuthDisabled,
} from '@/config/env'
import { useTailsPrincipal } from '@/hooks/use-tails-principal'
import { cn } from '@/lib/utils'

type GroupMembersResponse = {
  permission_group: string
  user_ids?: string[]
  members?: Array<{
    user_id?: string
    email?: string | null
    name?: string | null
    preferred_username?: string | null
  }>
}

type UsersListResponse = {
  users: Array<Record<string, unknown>>
  next_cursor?: string | null
  nextCursor?: string | null
}

function displayName(m: { name?: string | null; preferred_username?: string | null; email?: string | null }, uid: string) {
  const namePart = String(m.name || m.preferred_username || '').trim()
  const emailPart = String(m.email || '').trim()
  if (namePart) return namePart
  if (emailPart) return emailPart
  return uid
}

function membersResponseToRows(
  res: GroupMembersResponse,
): Array<{ user_id: string; email?: string | null; name?: string | null; preferred_username?: string | null }> {
  const raw = res?.members ?? []
  const rows =
    raw.length > 0
      ? raw.map((m) => ({
          user_id: String(m.user_id ?? ''),
          email: m.email,
          name: m.name,
          preferred_username: m.preferred_username,
        }))
      : (res?.user_ids ?? []).map((uid) => ({ user_id: String(uid) }))
  return rows.filter((r) => r.user_id)
}

export function AdminPage() {
  const { isAdmin, principalReady } = useTailsPrincipal()
  const [activeGroup, setActiveGroup] = useState('')
  const [groups, setGroups] = useState<string[]>([])
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [members, setMembers] = useState<
    Array<{ user_id: string; email?: string | null; name?: string | null; preferred_username?: string | null }>
  >([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [addEmail, setAddEmail] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  const [users, setUsers] = useState<Array<Record<string, unknown>>>([])
  const usersNextCursorRef = useRef<string | null>(null)
  const usersFetchInFlight = useRef(false)
  const [usersHasMore, setUsersHasMore] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersMoreBusy, setUsersMoreBusy] = useState(false)
  const loadedUserIds = useRef(new Set<string>())
  const [pageError, setPageError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const defaultGroupName = getDefaultPermissionGroupName()
  const adminGroupName = getAdminPermissionGroupName()
  const [promoteCandidates, setPromoteCandidates] = useState<
    Array<{ user_id: string; email?: string | null; name?: string | null; preferred_username?: string | null }>
  >([])
  const [promoteLoading, setPromoteLoading] = useState(false)
  const [promoteError, setPromoteError] = useState<string | null>(null)
  const [promoteBusyUserId, setPromoteBusyUserId] = useState<string | null>(null)

  const showFeedback = useCallback((kind: 'success' | 'error', text: string) => {
    setFeedback({ kind, text })
    window.setTimeout(() => setFeedback(null), kind === 'success' ? 5000 : 10000)
  }, [])

  const loadGroups = useCallback(async () => {
    setGroupsLoading(true)
    setPageError(null)
    try {
      const names = await apiFetchJson<string[]>('/tails-iam/groups')
      setGroups(Array.isArray(names) ? names : [])
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Failed to load groups')
      setGroups([])
    } finally {
      setGroupsLoading(false)
    }
  }, [])

  const loadMembers = useCallback(
    async (group: string) => {
      const g = group.trim()
      setMembersError(null)
      setMembers([])
      if (!g) {
        return
      }
      setMembersLoading(true)
      try {
        const res = await apiFetchJson<GroupMembersResponse>(
          `/tails-iam/groups/${encodeURIComponent(g)}/members`,
        )
        setMembers(membersResponseToRows(res))
      } catch (e) {
        setMembersError(e instanceof Error ? e.message : 'Failed to load members')
      } finally {
        setMembersLoading(false)
      }
    },
    [],
  )

  const loadPromoteCandidates = useCallback(async () => {
    setPromoteError(null)
    setPromoteLoading(true)
    try {
      const [defRes, admRes] = await Promise.all([
        apiFetchJson<GroupMembersResponse>(
          `/tails-iam/groups/${encodeURIComponent(defaultGroupName)}/members`,
        ),
        apiFetchJson<GroupMembersResponse>(
          `/tails-iam/groups/${encodeURIComponent(adminGroupName)}/members`,
        ),
      ])
      const defaultRows = membersResponseToRows(defRes)
      const adminRows = membersResponseToRows(admRes)
      const adminIds = new Set(adminRows.map((r) => r.user_id))
      setPromoteCandidates(defaultRows.filter((r) => !adminIds.has(r.user_id)))
    } catch (e) {
      setPromoteCandidates([])
      setPromoteError(e instanceof Error ? e.message : 'Failed to load default / admin members')
    } finally {
      setPromoteLoading(false)
    }
  }, [defaultGroupName, adminGroupName])

  const loadUsersPage = useCallback(async (append: boolean) => {
    if (usersFetchInFlight.current) return
    if (append && !usersNextCursorRef.current) return
    usersFetchInFlight.current = true
    if (append) setUsersMoreBusy(true)
    else setUsersLoading(true)
    setPageError(null)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (append && usersNextCursorRef.current) params.set('cursor', usersNextCursorRef.current)
      const data = await apiFetchJson<UsersListResponse>(`/tails-iam/users?${params.toString()}`)
      const list = data?.users ?? []
      const next =
        data?.next_cursor != null && String(data.next_cursor).trim() !== ''
          ? String(data.next_cursor)
          : data?.nextCursor != null && String(data.nextCursor).trim() !== ''
            ? String(data.nextCursor)
            : null
      usersNextCursorRef.current = next
      setUsersHasMore(Boolean(next))
      if (!append) {
        setUsers([])
        loadedUserIds.current = new Set()
      }
      setUsers((prev) => {
        const base = append ? [...prev] : []
        for (const u of list) {
          const uid = String(u.user_id ?? '').trim()
          if (uid && loadedUserIds.current.has(uid)) continue
          if (uid) loadedUserIds.current.add(uid)
          base.push(u)
        }
        return base
      })
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      usersFetchInFlight.current = false
      setUsersLoading(false)
      setUsersMoreBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!principalReady || !isAdmin) return
    usersNextCursorRef.current = null
    setUsersHasMore(false)
    loadedUserIds.current = new Set()
    void loadGroups()
    void loadUsersPage(false)
    void loadPromoteCandidates()
  }, [principalReady, isAdmin, loadGroups, loadUsersPage, loadPromoteCandidates])

  const onOpenGroup = () => {
    const g = activeGroup.trim()
    setActiveGroup(g)
    void loadGroups()
    void loadMembers(g)
  }

  const onSelectGroup = (name: string) => {
    setActiveGroup(name)
    void loadMembers(name)
  }

  const onAddMember = async () => {
    const g = activeGroup.trim()
    const email = addEmail.trim()
    if (!g) {
      showFeedback('error', 'Enter a group name.')
      return
    }
    if (!email) {
      showFeedback('error', "Enter the member's email address.")
      return
    }
    if (!email.includes('@')) {
      showFeedback('error', 'Enter a valid email address.')
      return
    }
    setAddBusy(true)
    try {
      await apiFetchJson<undefined>(`/tails-iam/groups/${encodeURIComponent(g)}/members`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setAddEmail('')
      await loadGroups()
      await loadMembers(g)
      if (g === defaultGroupName || g === adminGroupName) void loadPromoteCandidates()
      showFeedback('success', 'Member added')
    } catch (e) {
      showFeedback('error', e instanceof Error ? e.message : 'Add failed')
    } finally {
      setAddBusy(false)
    }
  }

  const onAddToAdminGroup = async (uid: string, label: string) => {
    if (!window.confirm(`Add ${label} to the "${adminGroupName}" permission group?`)) return
    setPromoteBusyUserId(uid)
    try {
      await apiFetchJson<undefined>(
        `/tails-iam/groups/${encodeURIComponent(adminGroupName)}/members`,
        {
          method: 'POST',
          body: JSON.stringify({ user_id: uid }),
        },
      )
      await loadPromoteCandidates()
      await loadGroups()
      if (activeGroup.trim() === adminGroupName) void loadMembers(adminGroupName)
      if (activeGroup.trim() === defaultGroupName) void loadMembers(defaultGroupName)
      void loadUsersPage(false)
      showFeedback('success', `Added to ${adminGroupName}`)
    } catch (e) {
      showFeedback('error', e instanceof Error ? e.message : 'Failed to add to admin group')
    } finally {
      setPromoteBusyUserId(null)
    }
  }

  const onRemoveMember = async (uid: string, label: string) => {
    const g = activeGroup.trim()
    if (!g) return
    if (!window.confirm(`Remove ${label} (${uid}) from ${g}?`)) return
    try {
      await apiFetchJson<undefined>(
        `/tails-iam/groups/${encodeURIComponent(g)}/members/${encodeURIComponent(uid)}`,
        { method: 'DELETE' },
      )
      await loadMembers(g)
      await loadGroups()
      if (g === defaultGroupName || g === adminGroupName) void loadPromoteCandidates()
      showFeedback('success', 'Member removed')
    } catch (e) {
      showFeedback('error', e instanceof Error ? e.message : 'Remove failed')
    }
  }

  if (!getApiBaseUrl() && !isUiAuthDisabled()) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        Set <code className="text-foreground">VITE_TAILS_API_URL</code> to use admin tools.
      </div>
    )
  }

  if (!principalReady) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    )
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="Admin"
        description="Permission groups and membership. Promote users from the default group to admin, or add members by email."
      />

      {pageError ? (
        <div
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-2xl border px-4 py-3 text-sm"
          role="alert"
        >
          {pageError}
        </div>
      ) : null}

      {feedback ? (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-sm',
            feedback.kind === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200'
              : 'border-destructive/30 bg-destructive/5 text-destructive',
          )}
          role="status"
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
          <CardHeader className="border-border/60 border-b px-6 py-5">
            <CardTitle className="text-lg">Permission groups</CardTitle>
            <CardDescription>
              Select a group or enter a name to manage (new groups appear after the first member is added).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-6 py-6">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1 space-y-2">
                <Label htmlFor="admin-group-name" className="sr-only">
                  Group name
                </Label>
                <Input
                  id="admin-group-name"
                  value={activeGroup}
                  onChange={(e) => setActiveGroup(e.target.value)}
                  placeholder="Group name"
                  autoComplete="off"
                  className="h-10 rounded-xl"
                />
              </div>
              <Button type="button" className="rounded-xl" onClick={() => onOpenGroup()}>
                Load members
              </Button>
            </div>
            {groupsLoading ? (
              <Skeleton className="h-24 w-full rounded-xl" />
            ) : groups.length === 0 ? (
              <p className="text-muted-foreground text-sm">No groups in table yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2" aria-label="Permission groups">
                {groups.map((name) => (
                  <li key={name}>
                    <Button
                      type="button"
                      size="sm"
                      variant={name === activeGroup.trim() ? 'default' : 'outline'}
                      className="rounded-full"
                      aria-pressed={name === activeGroup.trim()}
                      onClick={() => onSelectGroup(name)}
                    >
                      {name}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
          <CardHeader className="border-border/60 border-b px-6 py-5">
            <CardTitle className="text-lg">
              Members
              {activeGroup.trim() ? (
                <span className="text-muted-foreground font-normal"> — {activeGroup.trim()}</span>
              ) : null}
            </CardTitle>
            <CardDescription>Remove users from the selected group or add them by email.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 px-6 py-6">
            {membersLoading ? (
              <Skeleton className="h-32 w-full rounded-xl" />
            ) : membersError ? (
              <p className="text-destructive text-sm" role="alert">
                {membersError}
              </p>
            ) : !activeGroup.trim() ? (
              <p className="text-muted-foreground text-sm">Enter a group name and click Load members.</p>
            ) : members.length === 0 ? (
              <p className="text-muted-foreground text-sm">No members in this group.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => {
                  const uid = m.user_id
                  const primary = displayName(m, uid)
                  const email = String(m.email || '').trim()
                  const sub = email && primary !== email ? email : ''
                  const label = displayName(m, uid)
                  return (
                    <li
                      key={uid}
                      className="border-border/70 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/50 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="text-foreground text-sm font-medium leading-snug">{primary}</p>
                        {sub ? <p className="text-muted-foreground text-xs">{sub}</p> : null}
                        <code className="text-muted-foreground block text-xs">{uid}</code>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 rounded-lg"
                        onClick={() => void onRemoveMember(uid, label)}
                      >
                        Remove
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="border-border/60 flex flex-wrap items-end gap-2 border-t pt-4">
              <div className="min-w-48 flex-1 space-y-2">
                <Label htmlFor="admin-add-email">Member email</Label>
                <Input
                  id="admin-add-email"
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="User email (must exist in Tails)"
                  autoComplete="email"
                  className="h-10 rounded-xl"
                />
              </div>
              <Button type="button" className="rounded-xl" disabled={addBusy} onClick={() => void onAddMember()}>
                {addBusy ? 'Adding…' : 'Add to group'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
        <CardHeader className="border-border/60 border-b px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <CardTitle className="text-lg">Default → admin</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-xl"
              disabled={promoteLoading}
              onClick={() => void loadPromoteCandidates()}
            >
              {promoteLoading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-6 py-6">
          {promoteLoading && promoteCandidates.length === 0 ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : promoteError ? (
            <p className="text-destructive text-sm" role="alert">
              {promoteError}
            </p>
          ) : promoteCandidates.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No one to promote — either everyone in {defaultGroupName} is already in {adminGroupName}, or the default
              group has no members yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {promoteCandidates.map((m) => {
                const uid = m.user_id
                const label = displayName(m, uid)
                const email = String(m.email || '').trim()
                const sub = email && label !== email ? email : ''
                return (
                  <li
                    key={uid}
                    className="border-border/70 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/50 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-foreground text-sm font-medium leading-snug">{label}</p>
                      {sub ? <p className="text-muted-foreground text-xs">{sub}</p> : null}
                      <code className="text-muted-foreground block text-xs">{uid}</code>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0 rounded-lg"
                      disabled={promoteBusyUserId !== null}
                      onClick={() => void onAddToAdminGroup(uid, label)}
                    >
                      {promoteBusyUserId === uid ? 'Adding…' : `Add to ${adminGroupName}`}
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/80 py-0 shadow-sm">
        <CardHeader className="border-border/60 border-b px-6 py-5">
          <CardTitle className="text-lg">Users (profiles)</CardTitle>
          <CardDescription>
            Directory of Tails user profiles. Add members to a group using email above; the user must already exist
            here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6 py-6">
          {usersLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-sm">No users returned.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>user_id</TableHead>
                  <TableHead>email</TableHead>
                  <TableHead>permission_group</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u, i) => {
                  const uid = String(u.user_id ?? '')
                  const nm = String(u.name ?? u.preferred_username ?? '')
                  const em = String(u.email ?? '')
                  const pg = String(u.permission_group ?? '')
                  return (
                    <TableRow key={uid || i}>
                      <TableCell className="font-medium">{nm}</TableCell>
                      <TableCell>
                        <code className="text-muted-foreground text-xs">{uid}</code>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{em}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{pg}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          {usersHasMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={usersMoreBusy}
              onClick={() => void loadUsersPage(true)}
            >
              {usersMoreBusy ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
