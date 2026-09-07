#!/usr/bin/env node
// 多管理员版本的升级补足（Docker entrypoint 与 npm 升级流程共用）：
// 引入 SUPER_ADMIN / ADMIN 两级角色后，存量部署的账号全部仍是 ADMIN，
// 系统内没有任何超级管理员 —— 用户管理与审计日志入口都不会出现。
// 这里在启动时做一次性补足：不存在任何超管时，把最早创建的管理员提升为超管。
//
// 设计约束：
//   - 幂等：已有超管时直接跳过，重复执行无副作用。
//   - 只升不降：不会把任何账号从 SUPER_ADMIN 降级。
//   - 想改为别的账号当超管：先把目标账号改成 SUPER_ADMIN（本脚本随后即跳过），
//     再把原超管降为 ADMIN（两者顺序不可颠倒，否则中途会出现无超管的空窗）。
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 模式判定与 lib/db-config.ts 同语义：显式 DB_PROVIDER 优先，
// 否则按连接串前缀推断，都没有则回退 SQLite
function detectMode() {
  const explicit = (process.env.DB_PROVIDER || '').trim().toLowerCase()
  if (explicit === 'sqlite' || explicit === 'postgres') return explicit
  const pgUrl = (process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim()
  return /^postgres(ql)?:\/\//i.test(pgUrl) ? 'postgres' : 'sqlite'
}

const argMode = process.argv[2]
const mode =
  argMode === 'sqlite' || argMode === 'postgres' ? argMode : detectMode()

// 独立运行（npm run db:ensure-super-admin）时补默认连接串；
// Docker 下 entrypoint 已按分支导出 SQLITE_URL / POSTGRES_URL
if (mode === 'sqlite' && !process.env.SQLITE_URL) {
  process.env.SQLITE_URL = `file:${path.resolve(
    process.env.SQLITE_PATH || './data/nav.db'
  )}`
}

const require = createRequire(import.meta.url)
const { PrismaClient } = require(path.join(root, 'generated', `prisma-${mode}`))

const prisma = new PrismaClient()

try {
  const superAdminCount = await prisma.user.count({
    where: { role: 'SUPER_ADMIN' },
  })
  if (superAdminCount > 0) {
    console.log('[ensure-super-admin] 已存在超级管理员，跳过')
    process.exit(0)
  }

  // 取最早创建的管理员：多副本并发启动时取值一致（id 兜底保证排序确定），
  // 即便两个副本同时执行也只是把同一个账号重复置为 SUPER_ADMIN
  const [oldest] = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: 1,
    select: { id: true, email: true },
  })

  if (!oldest) {
    console.log('[ensure-super-admin] 暂无管理账号（首次部署由 seed 创建超管），跳过')
    process.exit(0)
  }

  await prisma.user.update({
    where: { id: oldest.id },
    data: { role: 'SUPER_ADMIN' },
  })
  console.log(
    `[ensure-super-admin] 已将最早的管理员 ${oldest.email} 提升为超级管理员` +
      '（如需更换，先提升目标账号再降级原超管）'
  )
} catch (error) {
  console.error('[ensure-super-admin] 提升超级管理员失败：', error)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
