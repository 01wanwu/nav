# Conan Nav

一个简洁现代化的网址导航系统，基于 Next.js 15、Prisma 和 shadcn/ui 构建。

[![GitHub stars](https://img.shields.io/github/stars/kenanlabs/nav?style=social)](https://github.com/kenanlabs/nav/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/kenanlabs/nav?style=social)](https://github.com/kenanlabs/nav/network/members)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**其他语言**: [English](./README.md)

## ✨ 特性

### 前台导航
- 📂 **分类导航** - shadcn/ui Tabs 风格，按类别组织网站
- 🔍 实时搜索 - 毫秒级响应，无需页面跳转
- 📱 响应式设计 - 完美适配移动端
- 🎨 简洁优雅 - 严格遵循 shadcn/ui 设计规范
- 🖼️ 智能图标 - 自动获取网站图标，加载失败时显示首字母
- 🌓 暗黑模式 - 右上角一键切换（支持浅色/深色/跟随系统）
- 📜 **古诗词展示** - 每日诗词自动获取，优雅的竖向排版

### 后台管理
- 📊 数据统计 - 访问频次图表、网站排行
- 🌐 网站管理 - 增删改查、发布状态、图标显示、**站点测活**
- 📁 分类管理 - 自定义分类和排序
- 🗂️ **多工作区** - 独立内容空间绑定子域名，按域名路由展示，未匹配回退默认工作区
- 📦 **数据管理** - 导入/导出书签，支持JSON和Chrome书签格式
  - JSON格式：完整数据备份（包含描述、排序、发布状态等所有字段）
  - 全量备份：含工作区结构与域名绑定，用于整站迁移
  - Chrome书签：浏览器兼容格式（仅包含名称、URL和图标）
- 👥 **多管理员与角色分级** - 超级管理员 / 管理员两级：超管可管理账号与查看审计日志，管理员负责内容维护，详见[管理员与权限体系](docs/admin-permissions.zh-CN.md)
- ⚙️ 系统设置 - 网站名称、Logo、Favicon、GitHub链接、ICP备案等
- 📈 访问追踪 - 可开启/关闭的网站访问统计
- 🧩 **插件系统** - 内置收录、浏览器扩展等插件 + 用户上传声明式插件，详见[插件开发指南](docs/plugin-development.zh-CN.md)
- 📜 **操作审计日志** - 记录登录与站点/分类/工作区/域名/插件/系统设置/管理员变更，保留 90 天，仅超管可见（支持搜索与多维筛选）

### 技术亮点
- **两级管理员权限** - 超级管理员 / 管理员分级，角色以数据库为准，降级与改密即时生效；权限判定收敛在 `lib/roles.ts`
- **操作可追溯** - 关键管理操作写入审计日志，actor 冗余快照保留，管理员删除后仍可追溯
- **动态配置** - 后台实时修改网站设置
- **分页优化** - 所有列表页支持分页
- **类型安全** - 完整的 TypeScript 类型定义，零 any 类型
- **生产环境优化** - 统一日志管理，生产环境静默
- **数据可视化** - 使用 Recharts 展示访问频次统计
- **性能优化** - 数据库索引优化，客户端实时搜索（< 10ms 响应）
- **智能图标** - 用户配置 > 智能 Favicon > 首字母图标（优雅降级）
- **ICP备案支持** - 前台底部可配置显示 ICP 备案号和链接
- **多工作区子域名路由** - 域名精确匹配 + 工作区内容隔离，支持按工作区覆盖品牌展示
- **shadcn/ui 最佳实践** - 完整的组件组合模式（Card + CardHeader + CardTitle + CardAction）

## 📸 截图预览

<table>
  <tr>
    <td><img src="screenshots/01-home.png" alt="首页" /></td>
    <td><img src="screenshots/02-search.png" alt="搜索" /></td>
  </tr>
  <tr>
    <td><img src="screenshots/03-dashboard.png" alt="仪表盘" /></td>
    <td><img src="screenshots/04-data.png" alt="编辑管理员信息" /></td>
  </tr>
  <tr>
    <td><img src="screenshots/05-sites.png" alt="网站管理" /></td>
    <td><img src="screenshots/06-category.png" alt="分类管理" /></td>
  </tr>
  <tr>
    <td><img src="screenshots/07-system.png" alt="系统设置" /></td>
    <td><img src="screenshots/08-login.png" alt="登录页" /></td>
  </tr>
</table>


## 🛠️ 技术栈

- **前端**: Next.js 15 (App Router)、React 19、TypeScript
- **UI**: shadcn/ui、Tailwind CSS、Lucide Icons
- **图表**: Recharts
- **后端**: Next.js Server Actions、Prisma ORM
- **数据库**: SQLite（默认，零配置）/ PostgreSQL（可选）
- **认证**: 简单 Cookie 认证（单管理员）
- **部署**: Docker、GitHub Actions CI/CD

## 🚀 快速开始

### 本地开发

```bash
# 1. 安装依赖（postinstall 会自动生成 sqlite/postgres 双 Prisma client）
npm install

# 2. 配置环境变量（可选：SQLite 模式零配置即可用）
cp .env.example .env
# 仅在需要改用 PostgreSQL 时才需编辑 .env 配置连接参数

# 3. 初始化 SQLite 数据库（会自动填充基础数据）
npm run db:push  # 创建 ./data/nav.db，含 4 个分类 + 4 个示例网站

# 如需更多示例数据：
npm run db:seed:full  # 10个分类+50+个精选网站

# 4. 启动开发服务器
npm run dev
```

🌐 **访问地址**：
- 前台：`http://localhost:3000`
- 后台：`http://localhost:3000/admin`

**默认管理员账号**：
- 邮箱：`admin@example.com`
- 密码：`admin123`

💡 可在 `.env` 中通过 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 环境变量自定义首次初始化的管理员账号（仅首次 seed 生效）。

⚠️ **重要**：默认密码是公开的，公网部署务必通过环境变量设置口令，或首次登录后立即修改！

## 🗂️ 多工作区与子域名路由

工作区（Workspace）是独立的内容空间：每个工作区拥有自己的分类、网址和展示配置（标题、描述、Logo、Favicon），并可绑定一个或多个域名。访问不同子域名时自动展示对应工作区的内容，未匹配域名时回退到默认工作区。

```
浏览器访问 zh.example.com ──┐
浏览器访问 en.example.com ──┼──> 域名绑定精确匹配 ──> 渲染对应工作区
浏览器访问 nav.example.com ─┘   （未匹配/未发布）  ──> 渲染默认工作区
```

### 使用方式

1. 后台进入「工作区管理」创建工作区（如：中文站 `zh`、英文站 `en`）
2. 为工作区绑定域名（如 `zh.example.com`），并将域名 DNS 解析到服务器
3. 在后台顶栏切换工作区上下文，分别维护各自的分类与网址
4. 在「系统设置 → 基本信息」中按当前工作区编辑展示配置（留空回退全局）
5. 打开「发布开关」上线工作区；未发布的工作区即使绑定了域名也回退默认工作区

### 作用域说明

| 内容 | 作用域 |
|------|--------|
| 分类、网址 | 按工作区隔离 |
| 标题、描述、Logo、Favicon | 工作区覆盖，留空回退全局 |
| 分类 slug 唯一性 | 工作区内唯一，跨工作区可重名 |
| sitemap / robots | 按访问域名的工作区输出 |
| 功能开关、页脚版权、备案信息等 | 全局共享 |
| 访问统计（仪表盘） | 全站合计 |

后台顶栏的工作区切换器实时标示当前页面作用域：可切换 = 内容随工作区；灰色「全局」= 全站共享，不随工作区变化。

### 本地开发调试

本地无子域名时，开发模式支持查询参数模拟：

```bash
# 查询参数预览 slug 为 zh 的工作区
# 访问 http://localhost:3000/?__workspace=zh

# 或用 Host 头模拟域名
curl -H "Host: zh.example.com" http://localhost:3000/
```

预览环境可通过环境变量 `ENABLE_WORKSPACE_PREVIEW=true` 开启查询参数模拟（生产环境默认忽略，仅按域名匹配）。

### 数据持久化说明

工作区、分类、网址等全部数据持久化在数据库中。**默认使用 SQLite 存储**：未配置 PostgreSQL 连接参数时，数据保存在本地 SQLite 文件中（`SQLITE_PATH`，本地开发默认 `./data/nav.db`，Docker 内为 `/app/data/nav.db`），首次启动自动建表并写入种子数据，重启后数据保留。

配置 `POSTGRES_URL`（或 `postgres://` 前缀的 `DATABASE_URL`）即可切换为 PostgreSQL。Serverless 平台（Vercel / Cloudflare Workers）没有可持久化的本地文件系统，必须配置外部 PostgreSQL（如 Neon / Supabase / RDS），本地 SQLite 文件在该场景下无法使用。

## 📦 生产部署

### 方式一：使用 Docker（推荐）

本项目提供完整的 Docker 部署方案，包括优化的多阶段构建和 docker-compose 配置。

#### 快速开始

```bash
# 1. 克隆代码
git clone https://github.com/kenanlabs/nav.git
cd nav

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置 SESSION_SECRET（或 NEXTAUTH_SECRET）
# 数据库零配置：默认使用 SQLite（数据持久化在 nav-data 卷）

# 3. 启动服务（使用 GitHub Actions 构建的镜像）
docker compose up -d

# 4. 查看日志
docker compose logs -f nav
```

🌐 **访问地址**（根据 `PORT` 环境变量，默认 3000）：
- 本地：`http://localhost:3000`
- 远程：`http://你的服务器IP:3000` 或 `http://你的域名.com`
- 后台：`http://localhost:3000/admin` 或 `http://你的域名.com/admin`

#### 可选：切换 PostgreSQL 模式

```bash
# 1. 在 .env 中启用 postgres profile 所需变量
#    DB_PROVIDER=postgres
#    POSTGRES_PASSWORD=your-database-password-here

# 2. 带 profile 启动（同时拉起 PostgreSQL 与应用）
docker compose --profile postgres up -d
```

#### 环境变量（Docker 部署）

```bash
# 核心配置（必填）
SESSION_SECRET=your-session-secret-here # 会话签名密钥，未设置时回退 NEXTAUTH_SECRET
NEXTAUTH_SECRET=your-nextauth-secret-here
NEXTAUTH_URL=http://localhost:3000 # 生产环境填写实际域名

# 数据库配置（全部可选——默认 SQLite，无需任何配置）
DB_PROVIDER=sqlite # sqlite | postgres；未设置时按连接参数自动推断
POSTGRES_URL=postgresql://nav:password@postgresql:5432/nav # 仅 PostgreSQL 模式需要
SQLITE_PATH=/app/data/nav.db # SQLite 数据文件位置（挂载卷内）

# Docker 配置
PORT=3000
# 仅 postgres profile 模式（docker compose --profile postgres）：
POSTGRES_USER=nav
POSTGRES_PASSWORD=your-database-password-here # 启用 postgres profile 时必填
POSTGRES_DB=nav
POSTGRES_PORT=5432

# 初始管理员账号（可选，仅首次 seed 生效）
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your-admin-password-here
```

#### 常用命令

```bash
# 拉取最新镜像并重启
docker compose pull && docker compose up -d

# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f nav

# 停止服务
docker compose down

# 停止服务并删除数据卷（⚠️ 会删除数据库数据）
docker compose down -v
```

#### GitHub Actions CI/CD

本项目使用 GitHub Actions 自动构建 Docker 镜像，推送到 GitHub Container Registry：

- **镜像地址**: `ghcr.io/kenanlabs/nav:latest`
- **触发条件**: Git tag 推送（格式：`v*.*.*`）
- **构建结果**: 同时推送 `version` 和 `latest` 标签

**发布新版本**：

```bash
# 创建并推送 git tag（触发 GitHub Actions）
git tag v1.0.0
git push origin v1.0.0
```

### 方式二：使用 PM2 + Nginx

```bash
# 1. 克隆代码
git clone https://github.com/kenanlabs/nav.git
cd nav

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置 NEXTAUTH_SECRET（SQLite 模式无需数据库配置）

# 4. 初始化 SQLite 数据库
npm run db:push

# 5. 构建并启动
npm run build
npm start

# 或使用 PM2 管理
npm install -g pm2
pm2 start npm --name "nav" -- start
pm2 startup  # 设置开机自启
pm2 save
```

## ⚙️ 环境变量

| 变量名 | 说明 | 示例 | 必填 |
|--------|------|------|------|
| `DB_PROVIDER` | 显式指定数据库类型：`sqlite` 或 `postgres`；未设置时按连接参数自动推断 | `sqlite` | ❌ |
| `POSTGRES_URL` | PostgreSQL 连接串（自动推断的最高优先来源） | `postgresql://user:pass@localhost:5432/nav` | ❌（仅 PostgreSQL 模式） |
| `DATABASE_URL` | 旧版兼容：值为 `postgres://` 前缀时等同 `POSTGRES_URL` | `postgresql://user:pass@host:5432/nav` | ❌ |
| `SQLITE_PATH` | SQLite 数据库文件路径（目录与文件自动创建） | `./data/nav.db` | ❌（有默认值） |
| `SESSION_SECRET` | 后台会话签名密钥（HMAC），未设置时回退 `NEXTAUTH_SECRET` | 随机字符串（`openssl rand -base64 32`） | ❌（未设置时按构建自动生成；设置后镜像重建不丢会话） |
| `NEXTAUTH_SECRET` | 加密密钥（兼作会话签名回退密钥） | 随机字符串（`openssl rand -base64 32`） | ❌（与 SESSION_SECRET 二选一；Docker 会生成兜底密钥） |
| `NEXTAUTH_URL` | 应用完整 URL | `http://localhost:3000` 或 `https://your-domain.com` | ❌（Docker 有默认值） |
| `POSTGRES_PASSWORD` | `postgres` compose profile 的 PostgreSQL 密码 | 随机长字符串 | ✅（仅 postgres profile） |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 初始管理员账号，角色为**超级管理员**（仅首次 seed 生效，已存在同名账号时不覆盖） | 邮箱 / 强口令 | ❌ |

**Docker 部署**：配置 `SESSION_SECRET`（或 `NEXTAUTH_SECRET`）即可，数据库默认 SQLite 零配置；需要 PostgreSQL 时设置 `DB_PROVIDER=postgres` 与 `POSTGRES_PASSWORD` 并启用 postgres profile。

**本地开发**：SQLite 开箱即用；如偏好本地 PostgreSQL，设置 `POSTGRES_URL` 即可。

## 📁 项目结构

```
.
├── app/                  # Next.js App Router
│   ├── (public)/         # 前台页面
│   ├── admin/            # 后台管理
│   └── api/              # API 路由
├── components/           # React 组件
│   ├── ui/              # shadcn/ui 组件
│   ├── layout/          # 布局组件
│   │   ├── jinrishici-card.tsx         # 古诗词卡片组件
│   │   └── jinrishici-card-wrapper.tsx # 古诗词卡片包装器（动画）
│   ├── admin/           # 后台组件
│   ├── poetry-toggle.tsx         # 古诗词开关按钮
│   └── theme-provider/  # 主题提供者
├── hooks/
│   └── use-poetry-toggle.ts  # 古诗词显示状态管理 hook
├── lib/                 # 工具函数和 Server Actions
├── prisma/              # 数据库模型和种子数据
├── public/              # 静态资源
└── screenshots/         # 项目截图
```

## 🔄 升级指南

从 **v0.0.8** 开始支持自动数据库迁移（版本化）。

### 从 v0.0.8 升级（含）之后的版本

**Docker**（自动）：
```bash
docker compose pull && docker compose up -d
# entrypoint.sh 自动同步 SQLite 表结构（PostgreSQL 模式则执行数据库迁移）
# ✅ 无需手动操作，安全可靠
```

**npm**：
```bash
git pull && npm install && npm start
# SQLite（默认）：如启动报字段缺失，先执行 npm run db:push 同步表结构
# PostgreSQL：启动前执行 npm run db:migrate:deploy
```

### 升级到多管理员版本（SUPER_ADMIN / ADMIN）

升级会新增 `SUPER_ADMIN` 角色与 `AuditLog` 审计表，**已有账号角色保持 `ADMIN` 不变**——
即升级后还没有任何超级管理员，「用户管理 / 审计日志」入口不会显示。需手动提升一个信任账号：

```sql
UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "email" = 'you@example.com';
```

然后重新登录一次。全新部署不受影响：seed 创建的初始账号就是超级管理员。
完整说明见[管理员与权限体系](docs/admin-permissions.zh-CN.md#从单管理员版本升级)。


---

## 🔧 常见问题

### npx prisma generate 和 npm run db:push 的区别？

- **`npm install`**：安装依赖并经 postinstall 钩子生成 sqlite/postgres 双 Prisma client，schema 变化后重跑即可
- **`npm run db:push`**：创建/同步 SQLite 表结构 + 填充初始数据，首次安装或 schema 变化时需要

### 为什么数据库连接失败？

**SQLite（默认）**：
1. 数据目录（`./data`）是否可写
2. `SQLITE_PATH` 是否指向有效位置
3. 直接运行 `node .next/standalone/server.js` 时请使用绝对路径——standalone 服务启动时会切换工作目录，相对路径会解析到 `.next/standalone/` 下

**PostgreSQL**：
1. PostgreSQL 服务是否启动
2. `.env` 文件中的 `POSTGRES_URL`（或 `DATABASE_URL`）是否正确
3. 数据库用户名和密码是否正确
4. 数据库 `nav` 是否已创建

### 如何重置管理员密码？

**方法 1**（推荐）：登录后台 → 点击侧边栏头像 → 编辑资料 → 修改密码

**方法 2**：连接数据库删除管理员后重新初始化
```bash
# 1. 删除管理员（PostgreSQL）
psql -h localhost -U nav -d nav -c "DELETE FROM \"User\" WHERE email = 'admin@example.com';"

# 或从 SQLite 文件中删除（默认模式）
sqlite3 ./data/nav.db "DELETE FROM \"User\" WHERE email = 'admin@example.com';"

# 2. 重新初始化数据库
npm run db:push
```

### 为什么直接修改数据库后前台不更新？

#### 数据更新流程

1. **后台管理界面操作**（推荐）
   - 在后台添加/修改网站或分类
   - 前台立即生效（页面动态渲染，每次写操作都会触发缓存失效）
   - ✅ **无需重启服务或重新构建**

2. **直接操作数据库**
   - 使用 SQL、Prisma Studio 等工具直接修改数据库
   - 前台无法感知这类变更——页面每次请求都从数据库读取，读取类数据立即生效，但应用内缓存的聚合信息（如分类计数）可能滞后到下一次经后台写入
   - ⚠️ **除非清楚自己在改什么，避免直接操作数据库**

#### 最佳实践

- ✅ **优先使用后台管理界面**进行所有数据操作
- ✅ 避免直接操作数据库（批量导入请使用内置的数据导入工具）

### 后台为什么看不到「用户管理 / 审计日志」？

这两个入口**仅超级管理员可见**。常见原因：

1. 当前账号是普通管理员（`ADMIN`）——只能做内容维护，不能管理账号；
2. 刚从旧版本升级——已有账号不会自动升级为超管，需手动执行一条 SQL，见
   [升级到多管理员版本](#升级到多管理员版本super_admin--admin)；
3. 登录后角色才被调整过——退出重新登录即可（角色以数据库为准，旧会话会即时失效）。

自己的资料和密码在**侧边栏头像 → 编辑资料**中修改，所有角色都能用。
角色模型与自我保护规则见[管理员与权限体系](docs/admin-permissions.zh-CN.md)。

### 超级管理员的密码忘了怎么办？

超管不可被删除，也不可被其他超管重置密码，只能直连数据库改密码哈希（重新 seed 不会覆盖已有账号）。
步骤见[管理员与权限体系](docs/admin-permissions.zh-CN.md#超管密码遗失)。

### 如何备份数据库？

**⚠️ 重要提示**：在执行任何数据库操作前，请务必备份数据库！

#### Docker 环境（SQLite，默认）

```bash
# 1. 停止服务
docker compose down

# 2. 备份 SQLite 数据卷（包含所有数据）
docker run --rm -v nav_nav-data:/data -v $(pwd):/backup alpine tar czf /backup/nav-data-$(date +%Y%m%d_%H%M%S).tar.gz /data

# 3. 重新启动服务
docker compose up -d
```

#### Docker 环境（PostgreSQL profile）

```bash
docker compose exec postgresql pg_dump -U nav nav > backup_$(date +%Y%m%d_%H%M%S).sql
```

#### npm 环境（SQLite，默认）

```bash
# 数据库是单个文件——直接复制即完成备份
cp ./data/nav.db ./backup_$(date +%Y%m%d_%H%M%S).db
```

#### 如何恢复备份？

```bash
# Docker（SQLite）：恢复数据卷
docker run --rm -v nav_nav-data:/data -v $(pwd):/backup alpine sh -c "cd / && tar xzf /backup/nav-data-20260121_143000.tar.gz"

# Docker（PostgreSQL profile）
docker compose exec postgresql psql -U nav nav < backup_20260121_143000.sql

# npm（SQLite）：复制回数据文件
cp ./backup_20260121_143000.db ./data/nav.db
```

#### 备份策略建议

1. **定期自动备份**：使用 cron 定时任务每日备份
2. **异地备份**：将备份文件上传到云存储（S3/OSS）
3. **备份验证**：定期测试备份文件是否可恢复
4. **备份保留**：保留至少 30 天的备份文件

#### 导出数据（不包含访问统计）

如果只需要网站和分类数据（不包含访问统计），可以使用后台的"数据管理"功能：

- 导出为 JSON 格式：包含所有网站、分类、系统设置
- 不包含：访问记录、管理员账号

这适合数据迁移和部分恢复场景。

## 💡 相关资源

- 📘 [完整文档](https://deepwiki.com/kenanlabs/nav)
- 📬 [问题反馈](../../issues)
- 💬 [讨论区](../../discussions)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=kenanlabs/nav&type=date&legend=top-left)](https://www.star-history.com/#kenanlabs/nav&type=date&legend=top-left)

## 🤝 贡献

欢迎贡献代码、报告问题或提出新功能建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 License

MIT

## 🙏 致谢

- [Next.js](https://nextjs.org/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Prisma](https://www.prisma.io/)
- [Tailwind CSS](https://tailwindcss.com/)
