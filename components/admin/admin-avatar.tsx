"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { UserEditDialog } from "./user-edit-dialog"

interface UserData {
  id: string
  email: string
  name?: string | null
  avatar?: string | null
}

// 缓存用户数据（模块级缓存，不要持久化到 localStorage）
let userCache: UserData | null = null

// 清除缓存的辅助函数（用于调试或登出后）
export function clearUserCache() {
  userCache = null
}

export function AdminAvatar() {
  const router = useRouter()
  const [user, setUser] = useState<UserData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  useEffect(() => {
    // 从缓存获取用户信息
    if (userCache) {
      setUser(userCache)
      setIsLoading(false)
      return
    }

    // 从 cookie 获取用户 ID
    const getUserId = async () => {
      try {
        const res = await fetch("/api/admin/me", {
          credentials: "include", // 确保发送 cookie
        })
        if (res.ok) {
          const data = await res.json()
          if (data.user) {
            userCache = data.user
            setUser(data.user)
          } else {
            console.error("No user data in response:", data)
          }
        } else {
          console.error("Failed to fetch user, status:", res.status)
        }
      } catch (error) {
        console.error("Failed to fetch user:", error)
      } finally {
        setIsLoading(false)
      }
    }

    getUserId()
  }, [])

  // 加载中显示 skeleton
  if (isLoading) {
    return (
      <div className="flex items-center gap-3 w-full px-2 py-2">
        <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
        <div className="flex flex-col flex-1 min-w-0">
          <div className="h-4 w-24 bg-muted animate-pulse rounded mb-1" />
          <div className="h-3 w-32 bg-muted animate-pulse rounded" />
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // 生成用户名首字母作为 fallback
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email
        .split("@")[0]
        .slice(0, 2)
        .toUpperCase()

  const handleEdit = () => {
    setEditDialogOpen(true)
  }

  return (
    <>
      <button
        onClick={handleEdit}
        className="flex items-center gap-3 w-full px-2 py-2 hover:bg-accent rounded-md transition-colors cursor-pointer"
      >
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.avatar || undefined} alt={user.name || user.email} />
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col items-start flex-1 min-w-0">
          <span className="text-sm font-medium truncate">
            {user.name || "管理员"}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            {user.email}
          </span>
        </div>
      </button>

      {editDialogOpen && (
        <UserEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          userId={user.id}
          userEmail={user.email}
          userName={user.name}
          onUpdate={(updatedUser) => {
            userCache = updatedUser
            setUser(updatedUser)
          }}
        />
      )}
    </>
  )
}
