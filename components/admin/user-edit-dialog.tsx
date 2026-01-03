"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Loader2 } from "lucide-react"
import { updateUser } from "@/lib/actions"
import { useToast } from "@/hooks/use-toast"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface UpdatedUser {
  id: string
  email: string
  name: string | null
  avatar: string | null
}

interface UserEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userEmail: string
  userName?: string | null
  onUpdate?: (user: UpdatedUser) => void
}

export function UserEditDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
  userName,
  onUpdate,
}: UserEditDialogProps) {
  const { toast } = useToast()
  const [name, setName] = useState(userName || "")
  const [email, setEmail] = useState(userEmail)
  const [avatar, setAvatar] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setName(userName || "")
    setEmail(userEmail)
    setAvatar("")
    setPassword("")
    setConfirmPassword("")
  }, [userName, userEmail, open])

  // 生成用户名首字母作为 fallback
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : email
        .split("@")[0]
        .slice(0, 2)
        .toUpperCase()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      toast({
        variant: "destructive",
        title: "邮箱格式错误",
        description: "请输入有效的邮箱地址",
      })
      return
    }

    // 如果填写了密码，验证密码
    if (password && password.length < 6) {
      toast({
        variant: "destructive",
        title: "密码太短",
        description: "密码长度至少为6个字符",
      })
      return
    }

    if (password && password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "密码不匹配",
        description: "两次输入的密码不一致",
      })
      return
    }

    setLoading(true)
    try {
      const updateData: {
        email?: string
        name?: string
        password?: string
        avatar?: string
      } = {}

      if (email !== userEmail) {
        updateData.email = email
      }

      if (name !== userName) {
        updateData.name = name || undefined
      }

      if (password) {
        updateData.password = password
      }

      if (avatar) {
        updateData.avatar = avatar
      }

      // 如果没有任何更改，直接关闭
      if (Object.keys(updateData).length === 0) {
        onOpenChange(false)
        setLoading(false)
        return
      }

      const result = await updateUser(userId, updateData)
      if (result.success) {
        toast({
          title: "更新成功",
          description: "管理员信息已成功更新",
        })
        // 更新缓存中的用户信息
        if (onUpdate && result.data) {
          onUpdate(result.data)
        }
        onOpenChange(false)
      } else {
        toast({
          variant: "destructive",
          title: "更新失败",
          description: result.error || "无法更新信息，请稍后重试",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "更新失败",
        description: "发生错误，请稍后重试",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>编辑管理员信息</DialogTitle>
            <DialogDescription>
              修改管理员的头像、名称、邮箱和密码
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* 头像预览和输入 */}
            <div className="space-y-2">
              <Label htmlFor="avatar">头像 URL</Label>
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={avatar || undefined} alt="头像预览" />
                  <AvatarFallback className="text-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <Input
                    id="avatar"
                    type="url"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="请输入头像图片 URL（可选）"
                  />
                  <p className="text-xs text-muted-foreground">
                    推荐使用正方形图片，建议尺寸 200x200 像素
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="请输入邮箱"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="请输入姓名（可选）"
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="password">新密码（留空则不修改）</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入新密码（至少6个字符）"
                minLength={password ? 6 : undefined}
              />
            </div>
            {password && (
              <div className="space-y-2">
                <Label htmlFor="confirm-password">确认密码</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  required
                  minLength={6}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存修改
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
