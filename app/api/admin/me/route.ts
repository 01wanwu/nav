import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAdminSession } from "@/lib/api-auth"
import { clearSessionCookies } from "@/lib/auth-cookies"

export async function GET() {
  try {
    // 签名会话校验：伪造/过期/非 ADMIN 的 cookie 在此被拒绝
    const session = await getAdminSession()
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        // 供前端控制超管专属入口（用户管理/审计日志）展示
        role: true,
      },
    })

    if (!user) {
      // 会话指向的用户已不存在（数据库重建/切换部署模式的残留会话）：
      // 清除无效会话 cookie，使 middleware 与本接口（查库校验）判断恢复一致
      const response = NextResponse.json({ user: null }, { status: 401 })
      return clearSessionCookies(response)
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error("Error fetching user:", error)
    return NextResponse.json({ user: null }, { status: 500 })
  }
}
