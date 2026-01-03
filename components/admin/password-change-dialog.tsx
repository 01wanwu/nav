"use client"

import { useState } from "react"
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
import { Loader2 } from "lucide-react"
import { updateUser } from "@/lib/actions"
import { useToast } from "@/hooks/use-toast"

interface PasswordChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userEmail: string
}

export function PasswordChangeDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
}: PasswordChangeDialogProps) {
  const { toast } = useToast()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < 6) {
      toast({
        variant: "destructive",
        title: "密码太短",
        description: "密码长度至少为6个字符",
      })
      return
    }

    if (password !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "密码不匹配",
        description: "两次输入的密码不一致",
      })
      return
    }

    setLoading(true)
    try {
      const result = await updateUser(userId, { password })
      if (result.success) {
        toast({
          title: "密码已修改",
          description: "用户密码已成功更新",
        })
        onOpenChange(false)
        setPassword("")
        setConfirmPassword("")
      } else {
        toast({
          variant: "destructive",
          title: "修改失败",
          description: result.error || "无法修改密码，请稍后重试",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "修改失败",
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
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>
              为用户 <span className="font-semibold">{userEmail}</span> 修改密码
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="password">新密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入新密码（至少6个字符）"
                required
                minLength={6}
              />
            </div>
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
              确认修改
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
