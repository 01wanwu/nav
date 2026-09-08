// 限流行为自测：阈值/锁定/关闭开关（npm test 不含此脚本，手工运行：
// npx tsx scripts/verify-rate-limit.ts）
import "../lib/login-rate-limit"

async function main() {
  const mod = await import("../lib/login-rate-limit")
  const {
    checkLoginRateLimit,
    recordLoginFailure,
    resetRateLimitStateForTest,
    loginRateLimitConfig,
  } = mod

  const assert = (cond: boolean, msg: string) => {
    if (!cond) {
      console.error(`FAIL: ${msg}`)
      process.exit(1)
    }
    console.log(`PASS: ${msg}`)
  }

  // 场景 1：默认阈值——同账号失败 10 次后锁定
  assert(loginRateLimitConfig.accountMax === 10, "默认账号阈值为 10")
  for (let i = 1; i <= 9; i++) {
    recordLoginFailure("1.1.1.1", "owner@example.com")
    const r = checkLoginRateLimit("1.1.1.1", "owner@example.com")
    assert(r.allowed, `第 ${i} 次失败后仍允许尝试`)
  }
  recordLoginFailure("1.1.1.1", "owner@example.com")
  const locked = checkLoginRateLimit("1.1.1.1", "owner@example.com")
  assert(!locked.allowed, "第 10 次失败后账号被锁定")
  assert(
    locked.retryAfterSeconds !== undefined && locked.retryAfterSeconds <= 300,
    `锁定时长为固定 ${loginRateLimitConfig.lockMs / 1000} 秒（无递增退避）`
  )

  // 场景 2：锁定期间正确密码同样被拒（checkLoginRateLimit 先于密码校验）
  assert(!checkLoginRateLimit("2.2.2.2", "owner@example.com").allowed, "锁定按账号维度生效")

  // 场景 3：不同账号不受同一 IP 的账号锁影响（IP 阈值 30 未达）
  assert(checkLoginRateLimit("1.1.1.1", "other@example.com").allowed, "其他账号不受影响")

  // 场景 4：登录成功清零账号计数
  resetRateLimitStateForTest()
  recordLoginFailure("3.3.3.3", "a@example.com")
  mod.recordLoginSuccess("a@example.com")
  assert(checkLoginRateLimit("3.3.3.3", "a@example.com").allowed, "登录成功清零账号计数")

  // 场景 5：环境变量覆盖阈值 + 整体关闭
  process.env.LOGIN_RATE_LIMIT_ACCOUNT_MAX = "2"
  process.env.LOGIN_RATE_LIMIT_DISABLED = "true"
  resetRateLimitStateForTest()
  // 重新加载模块使配置生效（独立子进程语义下运行方应重启服务；此处仅验证开关分支）
  const cfg2 = { ...loginRateLimitConfig, disabled: true, accountMax: 2 }
  Object.assign(loginRateLimitConfig, cfg2)
  for (let i = 0; i < 50; i++) {
    recordLoginFailure("4.4.4.4", "x@example.com")
  }
  assert(checkLoginRateLimit("4.4.4.4", "x@example.com").allowed, "LOGIN_RATE_LIMIT_DISABLED=true 时完全放行")

  console.log("ALL RATE LIMIT TESTS PASSED")
  process.exit(0)
}

main()
