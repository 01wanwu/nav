import { redirect } from "next/navigation"
import { getAdminSession } from "@/lib/api-auth"
import { AdminLayout } from "@/components/admin/admin-layout"

// 后台框架（侧边栏/顶栏/工作区切换器）唯一挂载点：
// 路由组不影响 URL；子模块间导航时 AdminLayout 跨路由复用，
// 避免整棵框架卸载重挂与切换器/侧边栏的重复请求往返

// 服务端鉴权门（整组生效，子页面无需各自实现）：
// middleware 跑在 Edge 无法查库，签名有效但用户已不存在/角色已变更的
// 残留会话会被它放行——若不在此处查库拦截，页面壳渲染后所有 API 401，
// 且「已登录访问登录页踢回后台」的重定向会让人永远进不了登录页（死循环）。
// redirect 到登录页后，重新登录即写入新会话，完成自愈。
export default async function DashLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getAdminSession()
  if (!session) {
    redirect("/admin/login")
  }
  return <AdminLayout>{children}</AdminLayout>
}
