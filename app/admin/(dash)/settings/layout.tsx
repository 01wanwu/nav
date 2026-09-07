// 后台框架由路由组 (dash)/layout.tsx 统一挂载，此处仅作占位透传
export default function ModuleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
