#!/usr/bin/env node
// 初始账号对齐（与 scripts/ensure-super-admin.mjs 同族的启动期检查）：
//
// ADMIN_EMAIL / ADMIN_PASSWORD 仅在数据库首次初始化时由 seed 读取。
// 部署方在首次初始化之后才设置（或更换）这两个变量时，库里并没有对应账号，
// 会出现「按环境变量登录却 401」且极难自查的问题。
//
// 本脚本做对齐：ADMIN_EMAIL 在库中不存在且 ADMIN_PASSWORD 已提供时，
// 创建该超级管理员账号；该邮箱已存在则**不覆盖密码**（尊重库内现状，
// 避免环境变量意外把可用密码冲掉）。幂等，可重复执行。
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function detectMode() {
  const explicit = (process.env.DB_PROVIDER || "").trim().toLowerCase()
  if (explicit === "sqlite" || explicit === "postgres") return explicit
  const pgUrl = (process.env.POSTGRES_URL || process.env.DATABASE_URL || "").trim()
  return /^postgres(ql)?:\/\//i.test(pgUrl) ? "postgres" : "sqlite"
}

const argMode = process.argv[2]
const mode =
  argMode === "sqlite" || argMode === "postgres" ? argMode : detectMode()

if (mode === "sqlite" && !process.env.SQLITE_URL) {
  process.env.SQLITE_URL = `file:${path.resolve(
    process.env.SQLITE_PATH || "./data/nav.db"
  )}`
}

const email = (process.env.ADMIN_EMAIL || "").trim()
const password = process.env.ADMIN_PASSWORD || ""

if (!email || !password) {
  // 未提供即跳过：不视为错误（大多数部署在后台里改密）
  process.exit(0)
}
if (password.length < 6) {
  console.warn("[ensure-env-admin] ADMIN_PASSWORD 少于 6 位（无法通过登录校验），跳过对齐")
  process.exit(0)
}

const require = createRequire(import.meta.url)
const { PrismaClient } = require(path.join(root, "generated", `prisma-${mode}`))
const bcrypt = require("bcryptjs")

const prisma = new PrismaClient()

try {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  })

  if (existing) {
    console.log(
      `[ensure-env-admin] ADMIN_EMAIL=${email} 对应的账号已存在（不覆盖库内密码）`
    )
    process.exit(0)
  }

  const hash = await bcrypt.hash(password, 10)
  const created = await prisma.user.create({
    data: {
      email,
      password: hash,
      name: "超级管理员",
      role: "SUPER_ADMIN",
    },
    select: { email: true, role: true },
  })
  console.log(
    `[ensure-env-admin] 已按环境变量创建超级管理员 ${created.email}（密码来自 ADMIN_PASSWORD）`
  )
} catch (error) {
  console.error("[ensure-env-admin] 初始账号对齐失败：", error?.message || error)
  process.exit(1)
} finally {
  await prisma.$disconnect()
}
