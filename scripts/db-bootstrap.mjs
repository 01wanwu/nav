#!/usr/bin/env node
// PostgreSQL 模式的构建期数据库引导（挂 postinstall，Vercel 等平台无 entrypoint，
// npm install 是平台构建流程中唯一必定执行的钩子）：
//   1. prisma migrate deploy（版本化迁移，幂等）
//   2. prisma/seed.ts full（内部检查管理员存在与否，幂等）
// SQLite（默认）模式直接跳过——本地开发与 Docker 构建不受影响。
// 失败策略：Vercel（VERCEL=1）上阻断安装使错误显性化；本地仅警告放行，
// 避免库未启动时连 npm install 都无法完成。
import { execSync } from 'node:child_process'

function isPostgresMode() {
  const explicit = process.env.DB_PROVIDER?.trim().toLowerCase()
  if (explicit === 'sqlite') return false
  const pgUrl = (process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim()
  return explicit === 'postgres' || (!explicit && /^postgres(ql)?:\/\//i.test(pgUrl))
}

if (!isPostgresMode()) {
  console.log('[db-bootstrap] SQLite（默认）模式：跳过 PostgreSQL 引导')
  process.exit(0)
}

const pgUrl = (process.env.POSTGRES_URL || process.env.DATABASE_URL).trim()
const onVercel = process.env.VERCEL === '1'
const env = { ...process.env, POSTGRES_URL: pgUrl }

function run(cmd, { retries = 1, label } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      execSync(cmd, { stdio: 'inherit', env })
      return true
    } catch (error) {
      console.error(`[db-bootstrap] ${label} 失败（第 ${attempt}/${retries} 次）：${error.message}`)
      if (attempt === retries) return false
      // Serverless 数据库（Neon 等）冷启动可能暂不可达，退避后重试
      execSync('sleep 5')
    }
  }
  return false
}

console.log('[db-bootstrap] PostgreSQL 模式：执行 migrate deploy ...')
const migrated = run('npx prisma migrate deploy', { retries: 3, label: 'migrate deploy' })

if (!migrated) {
  if (onVercel) {
    console.error(
      '[db-bootstrap] 迁移失败，中止构建。请检查 POSTGRES_URL 与数据库可达性' +
        '（Serverless 数据库如 Neon 冷启动可能较慢，可重新部署重试）。'
    )
    process.exit(1)
  }
  console.warn('[db-bootstrap] 本地环境：迁移失败仅警告（数据库可能未启动），请稍后手动执行 npm run db:migrate:deploy')
  process.exit(0)
}

console.log('[db-bootstrap] 执行 seed（幂等）...')
const seeded = run('npx tsx prisma/seed.ts full', { retries: 2, label: 'seed' })

if (!seeded) {
  if (onVercel) {
    console.error('[db-bootstrap] seed 失败，中止构建。')
    process.exit(1)
  }
  console.warn('[db-bootstrap] 本地环境：seed 失败仅警告，可稍后手动执行 npm run db:seed')
  process.exit(0)
}

// 升级补足：存量账号全部是 ADMIN 时提升最早的一个为 SUPER_ADMIN。
// 仅警告不阻断——没有超管只是「用户管理/审计日志不可用」，不应让构建失败
const ensured = run('node scripts/ensure-super-admin.mjs postgres', {
  retries: 2,
  label: 'ensure-super-admin',
})

if (!ensured) {
  console.warn('[db-bootstrap] 超管补足失败仅警告，可稍后手动执行 npm run db:ensure-super-admin')
}

console.log('[db-bootstrap] PostgreSQL 引导完成')
