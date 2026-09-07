"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2, Plus, Search, ShieldCheck, KeyRound, Trash2, Pencil } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  getManagedUsers,
  createManagedUser,
  updateManagedUser,
  resetManagedUserPassword,
  deleteManagedUser,
} from "@/lib/actions"
import { resolveActionError } from "@/lib/action-error"

interface ManagedUser {
  id: string
  email: string
  name: string | null
  role: string
  createdAt: string | Date
}

const PAGE_SIZE = 20

export function AdminUsersManager() {
  const t = useTranslations("admin.usersManager")
  const tc = useTranslations("common")
  const tAE = useTranslations("actionErrors")
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [actorId, setActorId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")

  // 新建对话框
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ email: "", name: "", password: "", role: "ADMIN" })
  const [creating, setCreating] = useState(false)

  // 编辑对话框
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null)
  const [editForm, setEditForm] = useState({ email: "", name: "", role: "ADMIN" })
  const [editing, setEditing] = useState(false)

  // 重置密码对话框
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetting, setResetting] = useState(false)

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadUsers = useCallback(async (targetPage: number, keyword: string) => {
    setLoading(true)
    try {
      const result = await getManagedUsers({ page: targetPage, pageSize: PAGE_SIZE, search: keyword || undefined })
      if (result && result.success) {
        setUsers(result.data)
        setActorId(result.actorId)
        setTotalPages(result.pagination.totalPages)
        setPage(result.pagination.page)
      } else {
        toast.error(t("loadFailed"), {
          description: resolveActionError(tAE, (result as { error?: string })?.error, tc("retryLater")),
        })
      }
    } finally {
      setLoading(false)
    }
  }, [t, tAE, tc])

  useEffect(() => {
    loadUsers(1, "")
  }, [loadUsers])

  const handleSearch = () => {
    setSearch(searchInput)
    loadUsers(1, searchInput)
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      const result = await createManagedUser({
        email: createForm.email,
        password: createForm.password,
        name: createForm.name || null,
        role: createForm.role,
      })
      if (result.success) {
        toast.success(t("createSuccess"))
        setCreateOpen(false)
        setCreateForm({ email: "", name: "", password: "", role: "ADMIN" })
        loadUsers(1, search)
      } else {
        toast.error(t("createFailed"), {
          description: resolveActionError(tAE, result.error, tc("retryLater")),
        })
      }
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (user: ManagedUser) => {
    setEditTarget(user)
    setEditForm({ email: user.email, name: user.name || "", role: user.role })
  }

  const handleEdit = async () => {
    if (!editTarget) return
    setEditing(true)
    try {
      const result = await updateManagedUser(editTarget.id, {
        email: editForm.email,
        name: editForm.name || null,
        role: editForm.role,
      })
      if (result.success) {
        toast.success(t("updateSuccess"))
        setEditTarget(null)
        loadUsers(page, search)
      } else {
        toast.error(t("updateFailed"), {
          description: resolveActionError(tAE, result.error, tc("retryLater")),
        })
      }
    } finally {
      setEditing(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    setResetting(true)
    try {
      const result = await resetManagedUserPassword(resetTarget.id, resetPassword)
      if (result.success) {
        toast.success(t("resetSuccess"))
        setResetTarget(null)
        setResetPassword("")
      } else {
        toast.error(t("resetFailed"), {
          description: resolveActionError(tAE, result.error, tc("retryLater")),
        })
      }
    } finally {
      setResetting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const result = await deleteManagedUser(deleteTarget.id)
      if (result.success) {
        toast.success(t("deleteSuccess"))
        setDeleteTarget(null)
        loadUsers(page, search)
      } else {
        toast.error(t("deleteFailed"), {
          description: resolveActionError(tAE, result.error, tc("retryLater")),
        })
      }
    } finally {
      setDeleting(false)
    }
  }

  const renderRoleBadge = (role: string) =>
    role === "SUPER_ADMIN" ? (
      <Badge className="gap-1">
        <ShieldCheck className="h-3 w-3" />
        {t("roleSuperAdmin")}
      </Badge>
    ) : (
      <Badge variant="secondary">{t("roleAdmin")}</Badge>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 max-w-sm">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder={t("searchPlaceholder")}
          />
          <Button variant="outline" size="icon" onClick={handleSearch} aria-label={t("search")}>
            <Search className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t("addUser")}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("thEmail")}</TableHead>
              <TableHead>{t("thName")}</TableHead>
              <TableHead>{t("thRole")}</TableHead>
              <TableHead>{t("thCreatedAt")}</TableHead>
              <TableHead className="text-right">{t("thActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {tc("noData")}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.name || "-"}</TableCell>
                  <TableCell>{renderRoleBadge(user.role)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(user)}
                        title={t("edit")}
                        disabled={user.role === "SUPER_ADMIN" && user.id !== actorId}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setResetTarget(user)}
                        title={t("resetPassword")}
                        disabled={user.role === "SUPER_ADMIN" && user.id !== actorId}
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(user)}
                        title={t("delete")}
                        disabled={user.role === "SUPER_ADMIN"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => loadUsers(page - 1, search)}
          >
            {t("prevPage")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => loadUsers(page + 1, search)}
          >
            {t("nextPage")}
          </Button>
        </div>
      )}

      {/* 新建管理员 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-email">{t("emailLabel")}</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="admin@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-name">{t("nameLabel")}</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">{t("passwordLabel")}</Label>
              <Input
                id="create-password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
            </div>
            <div className="space-y-2">
              <Label>{t("roleLabel")}</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => setCreateForm({ ...createForm, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">{t("roleAdmin")}</SelectItem>
                  <SelectItem value="SUPER_ADMIN">{t("roleSuperAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleCreate} disabled={creating || !createForm.email || createForm.password.length < 6}>
              {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {tc("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑管理员 */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("editDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">{t("emailLabel")}</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t("nameLabel")}</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("roleLabel")}</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm({ ...editForm, role: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">{t("roleAdmin")}</SelectItem>
                  <SelectItem value="SUPER_ADMIN">{t("roleSuperAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleEdit} disabled={editing}>
              {editing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {tc("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置密码 */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("resetTitle")}</DialogTitle>
            <DialogDescription>
              {t("resetDesc", { email: resetTarget?.email || "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reset-password">{t("newPasswordLabel")}</Label>
            <Input
              id="reset-password"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("resetHint")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button onClick={handleResetPassword} disabled={resetting || resetPassword.length < 6}>
              {resetting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {tc("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDesc", { email: deleteTarget?.email || "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
