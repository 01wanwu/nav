// 多管理员角色辅助层。
//
// 角色模型（两级）：
//   SUPER_ADMIN（超管）：拥有 ADMIN 的全部能力，另可管理用户
//     （新增/编辑/删除管理员、重置密码、调整角色）与查看审计日志。
//   ADMIN（普通管理员）：内容维护——站点/分类/工作区/插件/数据/系统设置。
//
// 会话 token payload 中的 r 字段即角色字符串（见 lib/session.ts）。
// 判断一律经由本文件的 hasAdminRole，禁止散落硬编码 role === "ADMIN"，
// 否则新增角色时会遗漏校验点。

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"] as const

export type AdminRole = (typeof ADMIN_ROLES)[number]

export function isSuperAdminRole(role: string | undefined | null): boolean {
  return role === "SUPER_ADMIN"
}

/** 是否为任一可登录后台的管理角色（SUPER_ADMIN 或 ADMIN） */
export function hasAdminRole(role: string | undefined | null): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN"
}

/** 角色等级：超管 2 > 普通管理员 1 */
export function adminRoleLevel(role: string | undefined | null): number {
  return role === "SUPER_ADMIN" ? 2 : 1
}
