// 登录接口速率限制（暴力破解防护）
//
// 自托管优先的产品取舍：这是部署在用户自己服务器上的个人导航站，
// 限流的目的是拖慢爆破，而不是把站长锁在门外。因此：
// - 阈值宽松（账号 10 次 / IP 30 次 / 15 分钟窗口）
// - 锁定时长固定（默认 5 分钟），不做递增退避——误锁自己的代价远大于
//   对爆破者多锁几小时的边际收益
// - 全部参数可经环境变量调整，也可整体关闭
// - 单实例内存实现即可；多实例再换 Redis
//
// 可用环境变量：
//   LOGIN_RATE_LIMIT_DISABLED=true            整体关闭（内网/可信环境）
//   LOGIN_RATE_LIMIT_ACCOUNT_MAX=10           同账号失败上限
//   LOGIN_RATE_LIMIT_IP_MAX=30                同 IP 失败上限
//   LOGIN_RATE_LIMIT_WINDOW_MINUTES=15        计数窗口（分钟）
//   LOGIN_RATE_LIMIT_LOCK_SECONDS=300         锁定时长（秒）
//
// 登录成功清零账号维度计数；重启进程计数清空。

const WINDOW_MS = 15 * 60 * 1000
const COOLDOWN_MS = 60 * 60 * 1000

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const loginRateLimitConfig = {
  disabled: process.env.LOGIN_RATE_LIMIT_DISABLED?.trim().toLowerCase() === "true",
  accountMax: intEnv("LOGIN_RATE_LIMIT_ACCOUNT_MAX", 10),
  ipMax: intEnv("LOGIN_RATE_LIMIT_IP_MAX", 30),
  windowMs: intEnv("LOGIN_RATE_LIMIT_WINDOW_MINUTES", 15) * 60 * 1000,
  lockMs: intEnv("LOGIN_RATE_LIMIT_LOCK_SECONDS", 300) * 1000,
}

function now(): number {
  return Date.now()
}

type AttemptRecord = {
  failures: number
  windowStart: number
  lockedUntil?: number
  lastEventAt: number
}

const ipAttempts = new Map<string, AttemptRecord>()
const accountAttempts = new Map<string, AttemptRecord>()

// 防内存膨胀：键数量上限（登录接口的合理规模远低于此）
const MAX_KEYS = 10_000
function evictIfNeeded(map: Map<string, AttemptRecord>) {
  if (map.size <= MAX_KEYS) return
  for (const [key, record] of map) {
    const locked = Boolean(record.lockedUntil && record.lockedUntil > now())
    if (!locked && now() - record.lastEventAt > COOLDOWN_MS) {
      map.delete(key)
    }
  }
}

function getRecord(map: Map<string, AttemptRecord>, key: string): AttemptRecord {
  const existing = map.get(key)
  if (existing) {
    // 计数窗口过期：重置计数（锁定状态保留，由 isLocked 判定）
    if (now() - existing.windowStart >= loginRateLimitConfig.windowMs) {
      existing.failures = 0
      existing.windowStart = now()
      delete existing.lockedUntil
    }
    existing.lastEventAt = now()
    return existing
  }
  const fresh: AttemptRecord = {
    failures: 0,
    windowStart: now(),
    lastEventAt: now(),
  }
  map.set(key, fresh)
  return fresh
}

function isLocked(record: AttemptRecord): boolean {
  return Boolean(record.lockedUntil && record.lockedUntil > now())
}

export type LoginRateLimitResult = {
  allowed: boolean
  retryAfterSeconds?: number
}

function lockIfNeeded(
  map: Map<string, AttemptRecord>,
  key: string,
  maxFailures: number
): boolean {
  const record = getRecord(map, key)
  record.failures += 1
  if (record.failures >= maxFailures) {
    record.lockedUntil = now() + loginRateLimitConfig.lockMs
    record.failures = 0
    record.windowStart = now()
    return true
  }
  return false
}

/**
 * 登录前检查：IP 或账号任一命中锁定则拒绝
 */
export function checkLoginRateLimit(ip: string, email: string): LoginRateLimitResult {
  if (loginRateLimitConfig.disabled) return { allowed: true }

  evictIfNeeded(ipAttempts)
  evictIfNeeded(accountAttempts)

  const ipRecord = getRecord(ipAttempts, ip)
  if (isLocked(ipRecord)) {
    return { allowed: false, retryAfterSeconds: Math.ceil((ipRecord.lockedUntil! - now()) / 1000) }
  }

  const accountRecord = getRecord(accountAttempts, email.toLowerCase())
  if (isLocked(accountRecord)) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((accountRecord.lockedUntil! - now()) / 1000),
    }
  }

  return { allowed: true }
}

/**
 * 登录失败后记录：任一维度达阈值即进入锁定
 */
export function recordLoginFailure(ip: string, email: string): void {
  if (loginRateLimitConfig.disabled) return

  evictIfNeeded(ipAttempts)
  evictIfNeeded(accountAttempts)

  lockIfNeeded(ipAttempts, ip, loginRateLimitConfig.ipMax)
  lockIfNeeded(accountAttempts, email.toLowerCase(), loginRateLimitConfig.accountMax)
}

/**
 * 登录成功后清零账号维度计数（IP 维度保留，防止同 IP 换账号继续扫）
 */
export function recordLoginSuccess(email: string): void {
  accountAttempts.delete(email.toLowerCase())
}

/** 仅供测试：清空全部状态 */
export function resetRateLimitStateForTest(): void {
  ipAttempts.clear()
  accountAttempts.clear()
}

/** 仅供测试：时间旅行（模拟锁定到期/窗口流逝） */
export function __timeTravel(ms: number): void {
  const shift = (record: AttemptRecord) => {
    record.windowStart -= ms
    record.lastEventAt -= ms
    if (record.lockedUntil) record.lockedUntil -= ms
  }
  for (const record of ipAttempts.values()) shift(record)
  for (const record of accountAttempts.values()) shift(record)
}
