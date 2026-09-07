#!/bin/sh
set -e

# 会话签名密钥兜底：未显式配置时生成并持久化到 SESSION_SECRET_FILE（Dockerfile 预建的
# nextjs 可写目录 /app/.session-data/.session-secret，可在 compose 挂卷持久化），
# 保证容器重启后会话不全部失效（镜像重建时会重新生成，届时需重新登录）
if [ -z "$SESSION_SECRET" ] && [ -z "$NEXTAUTH_SECRET" ]; then
  SECRET_FILE="${SESSION_SECRET_FILE:-/app/.session-secret}"
  if [ -f "$SECRET_FILE" ]; then
    export SESSION_SECRET="$(cat "$SECRET_FILE")"
    echo "⚠️  使用容器内持久化的会话密钥（建议在环境变量中显式配置 SESSION_SECRET）"
  else
    export SESSION_SECRET="$(head -c 32 /dev/urandom | base64)"
    if echo "$SESSION_SECRET" > "$SECRET_FILE" 2>/dev/null; then
      chmod 600 "$SECRET_FILE" 2>/dev/null || true
    else
      # 写入失败（文件系统只读/无权限）：本次运行的会话重启后失效，显式提示避免静默掉线
      echo "❌ 警告：无法持久化会话密钥（$SECRET_FILE 不可写），容器重启后需重新登录。请配置 SESSION_SECRET 环境变量或挂载可写卷。"
    fi
    echo "⚠️  未配置 SESSION_SECRET，已自动生成会话密钥（建议在环境变量中显式配置并持久化）"
  fi
fi

# ===== 数据库模式判定（与 lib/db-config.ts 保持同一语义） =====
# 1. DB_PROVIDER 显式指定 sqlite / postgres 时优先生效
# 2. 未指定时：POSTGRES_URL 或 postgres:// 前缀的 DATABASE_URL 非空 → postgres
# 3. 否则 → sqlite（默认）
DB_MODE=""
EFFECTIVE_PG_URL="${POSTGRES_URL:-${DATABASE_URL:-}}"
case "$EFFECTIVE_PG_URL" in
  postgres://*|postgresql://*) PG_URL_VALID=1 ;;
  *) PG_URL_VALID=0 ;;
esac

if [ "$DB_PROVIDER" = "postgres" ] || [ "$DB_PROVIDER" = "sqlite" ]; then
  DB_MODE="$DB_PROVIDER"
elif [ "$PG_URL_VALID" = "1" ]; then
  DB_MODE="postgres"
else
  DB_MODE="sqlite"
fi

if [ "$DB_MODE" = "postgres" ] && [ "$PG_URL_VALID" != "1" ]; then
  echo "❌ DB_PROVIDER=postgres 但未提供有效连接串：请设置 POSTGRES_URL（或 postgres:// 前缀的 DATABASE_URL），或移除 DB_PROVIDER 使用默认 SQLite。"
  exit 1
fi

# seed 前置检查：无任何管理员账户时才执行种子初始化（sqlite / postgres 共用）
seed_if_needed() {
  echo "🔍 检查数据库是否已初始化..."
  # 必须同时覆盖 SUPER_ADMIN 与 ADMIN：引入两级角色后，存量账号被提升为超管
  # 是大概率操作，若这里只查 ADMIN，会误判为「未初始化」而重跑 seed（往已有
  # 数据的库里注入示例分类与站点）
  if node -e "
    const { PrismaClient } = require('./generated/prisma-${1}');
    const prisma = new PrismaClient();
    prisma.user.findFirst({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } })
      .then(user => {
        if (user) {
          console.log('✅ 数据库已初始化，跳过 seed');
          process.exit(0);
        } else {
          console.log('🌱 数据库未初始化，开始 seed...');
          process.exit(1);
        }
      })
      .catch(() => process.exit(1));
  "; then
    echo "✅ 跳过 seed"
  else
    echo "🌱 执行 seed 脚本（完整示例数据）..."
    npx tsx prisma/seed.ts full
  fi
}

# ===== SQLite 分支（默认） =====
if [ "$DB_MODE" = "sqlite" ]; then
  SQLITE_PATH="${SQLITE_PATH:-/app/data/nav.db}"
  export SQLITE_PATH
  export SQLITE_URL="file:${SQLITE_PATH}"
  SQLITE_DIR="$(dirname "$SQLITE_PATH")"
  mkdir -p "$SQLITE_DIR" 2>/dev/null || true
  if [ ! -w "$SQLITE_DIR" ]; then
    echo "❌ SQLite 目录不可写：$SQLITE_DIR（请挂载可写卷或调整权限）"
    exit 1
  fi

  echo "🗄️  数据库模式：SQLite（$SQLITE_PATH）"

  # 幂等建表：--accept-data-loss 仅在首次空库建表加唯一约束时跳过确认，对已同步库无操作
  npx prisma db push --schema prisma/schema.sqlite.prisma --accept-data-loss --skip-generate

  seed_if_needed sqlite

  echo "🚀 启动应用..."
  # --max-http-header-size：测活探测需要，避免 Google 等站点响应头超 undici 16KB 上限导致误判失效
  exec node --max-http-header-size=65536 server.js
fi

# ===== PostgreSQL 分支（配置了连接参数时） =====
export POSTGRES_URL="$EFFECTIVE_PG_URL"
echo "🐘 数据库模式：PostgreSQL"

echo "🔧 初始化数据库..."

# 数据库就绪重试：迁移与探测前先确保可达。
# 之前 DB 暂时不可达会让探测失败被误判为"schema 漂移"进而触发自动 db push，
# 且 set -e 下任何一次失败都会让容器退出进入 crash loop
DB_READY=0
i=0
while [ "$i" -lt 30 ]; do
  i=$((i + 1))
  if node -e "
    const { PrismaClient } = require('./generated/prisma-postgres');
    const prisma = new PrismaClient();
    prisma.\$queryRaw\`SELECT 1\`
      .then(() => { console.log('ready'); process.exit(0); })
      .catch(() => { process.exit(1); });
  " 2>/dev/null; then
    DB_READY=1
    break
  fi
  echo "⏳ 数据库未就绪，10 秒后重试（$i/30）..."
  sleep 10
done
if [ "$DB_READY" != "1" ]; then
  echo "❌ 数据库在 5 分钟内未就绪，放弃启动。请检查 POSTGRES_URL 与数据库状态。"
  exit 1
fi

# 检查是否存在迁移文件夹
if [ -d "/app/prisma/migrations" ] && [ "$(ls -A /app/prisma/migrations)" ]; then
  echo "📦 检测到迁移文件，执行 Prisma Migrate..."

  # 检查是否是首次初始化（通过 _prisma_migrations 表是否存在）
  MIGRATION_TABLE_EXISTS=$(node -e "
    const { PrismaClient } = require('./generated/prisma-postgres');
    const prisma = new PrismaClient();
    prisma.\$queryRaw\`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '_prisma_migrations'
      )
    \`
      .then(result => {
        const exists = result[0].exists;
        console.log(exists ? 'yes' : 'no');
        process.exit(0);
      })
      .catch(() => {
        console.log('no');
        process.exit(0);
      });
  " 2>/dev/null || echo "no")

  if [ "$MIGRATION_TABLE_EXISTS" = "no" ]; then
    echo "🆕 首次部署，检测数据库是否已有数据..."

    # 检查 Site 表是否存在（判断是否是已有数据的数据库）
    TABLE_EXISTS=$(node -e "
      const { PrismaClient } = require('./generated/prisma-postgres');
      const prisma = new PrismaClient();
      prisma.\$queryRaw\`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'Site'
        )
      \`
        .then(result => {
          const exists = result[0].exists;
          console.log(exists ? 'yes' : 'no');
          process.exit(0);
        })
        .catch(() => {
          console.log('no');
          process.exit(0);
        });
    " 2>/dev/null || echo "no")

    if [ "$TABLE_EXISTS" = "yes" ]; then
      echo "📊 检测到现有数据，同步数据库 schema..."
      # 一次性 legacy 升级路径（仅 _prisma_migrations 缺失的旧数据卷）：
      # db push 需要删列丢数据时会拒绝执行，此时请人工介入：
      #   npx prisma db push --accept-data-loss
      npx prisma db push --schema prisma/schema.prisma --skip-generate
      echo "📊 Schema 同步完成，进行基线化（baseline）..."
      # 标记所有迁移为已应用（因为数据库结构已经是最新）
      for migration_dir in /app/prisma/migrations/*/; do
        migration_name=$(basename "$migration_dir")
        echo "  标记迁移: $migration_name"
        npx prisma migrate resolve --applied "$migration_name" 2>/dev/null || true
      done
      echo "✅ 基线化完成"
    else
      echo "🆕 新数据库，执行迁移..."
      npx prisma migrate deploy
    fi
  else
    echo "🔄 执行待处理的数据库迁移..."
    npx prisma migrate deploy
  fi

  # 漂移检测：只警告，不再自动 db push 修复。
  # 自动修复在生产是破坏性/脆弱操作——需要删列时会因缺 --accept-data-loss 失败，
  # set -e 下容器进入 crash loop；漂移修复应由人工评估后执行 migrate/db push
  echo "🔍 校验数据库结构与 schema 一致性..."
  # prisma migrate diff --exit-code：一致退出 0，漂移退出非 0 并把差异 SQL 打到 stdout。
  # 赋值放在 if 条件里，set -e 不会因非零退出码中断；stderr 是 CLI 弃用告警等噪音，忽略
  if DRIFT_DETAIL="$(npx prisma migrate diff \
    --from-schema-datasource prisma/schema.prisma \
    --to-schema-datamodel prisma/schema.prisma \
    --exit-code 2>/dev/null)"; then
    echo "✅ 数据库结构与 schema 一致"
  else
    if [ -n "$DRIFT_DETAIL" ]; then
      echo "❌ 警告：数据库结构与 schema 不一致！差异明细（当前数据库 → schema 期望）："
      echo ""
      echo "$DRIFT_DETAIL"
      echo ""
    fi
    echo "❌ 请人工评估后执行"
    echo "    npx prisma migrate dev / npx prisma db push 修复漂移。"
    echo "    本次启动将继续，但可能出现字段缺失的运行时错误（P2022）。"
  fi
else
  echo "⚠️  未检测到迁移文件，使用 db push（开发模式）..."
  npx prisma db push --schema prisma/schema.prisma --skip-generate
fi

seed_if_needed postgres

echo "🚀 启动应用..."
# --max-http-header-size：测活探测需要，避免 Google 等站点响应头超 undici 16KB 上限导致误判失效
exec node --max-http-header-size=65536 server.js
