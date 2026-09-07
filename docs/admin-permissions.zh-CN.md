# 管理员与权限体系

> 适用版本：引入 `SUPER_ADMIN` / `ADMIN` 两级角色之后（迁移 `20260907000000_multi_admin`）。
> 相关源码：`lib/roles.ts`、`lib/api-auth.ts`、`lib/audit-log.ts`、`lib/actions.ts`、`middleware.ts`。

## 1. 角色模型

| | 超级管理员 SUPER_ADMIN | 管理员 ADMIN |
|---|---|---|
| 站点 / 分类 / 工作区 / 插件 / 数据导入导出 | ✅ | ✅ |
| 系统设置（/admin/settings） | ✅ | ✅ |
| 用户管理（/admin/users：新增、编辑、删除、重置密码、调整角色） | ✅ | ❌ |
| 审计日志（/admin/audit） | ✅ | ❌ |
| 编辑自己的资料与密码（侧边栏头像） | ✅ | ✅ |

- 角色是两级而非继承链：SUPER_ADMIN 拥有 ADMIN 的全部内容维护能力，另加账号管理与审计。
- 角色判定收敛在 `lib/roles.ts`（`hasAdminRole` / `isSuperAdminRole`）。新增角色或调整语义时只改这一处，
  禁止在业务代码里散落 `role === "ADMIN"` 之类的硬编码。

## 2. 自我保护规则

1. **角色以数据库为准**：会话 token 里的角色只作粗筛，`getAdminSession()` 每次都回查数据库。
   账号被降级后旧会话立即失效，无需等 token 过期（有效期 7 天）。
2. **改密即吊销**：改密 / 被重置密码会写 `User.passwordChangedAt`，签发时间早于它的全部 token 失效，
   该账号所有已登录设备被踢下线。
3. **超管是信任锚点**：超管账号不可被删除、不可被降级，也不可被其他超管重置密码
   （重置密码等同于接管账号，与删除/降级属于同一信任边界）。降权只能由本人改密或直连数据库。
4. **不能对自己动手**：不能删除自己、不能改自己的角色（避免把最后一个超管锁在门外）。
   重置自己的密码是允许的，等价于改密。
5. **改资料只能改自己**：`updateUser` 只接受会话本人的 id，传入他人 id 直接拒绝
   （Server Action 是公开可构造调用的 RPC，不能信任客户端传入的目标 id）。

## 3. 校验点分布（四道闸门）

| 位置 | 作用 | 判定 |
|---|---|---|
| `middleware.ts` | 页面 /admin 未登录跳登录页；/api/admin（除 login、status）未登录返回 401 | `hasAdminRole` |
| `app/api/admin/login/route.ts` | 登录时校验账号角色，非管理角色返回 403 | `hasAdminRole` |
| `lib/api-auth.ts` 的 `getAdminSession()` | 验签 + 查库 + 改密吊销，返回以数据库为准的角色 | `hasAdminRole` |
| `lib/actions.ts` | `requireAdmin()` 覆盖所有内容类 action；`requireSuperAdmin()` 覆盖用户管理与审计 | 按操作分级 |
| 页面服务端组件 | /admin/users、/admin/audit 非超管重定向到仪表盘 | 角色不等于 SUPER_ADMIN |

侧边栏按角色隐藏「用户管理 / 审计日志」入口（`components/admin/admin-sidebar.tsx` 读取 `/api/admin/me`
返回的 role）。隐藏入口只是展示层，真正的防线是上表中的服务端校验。

## 4. 审计日志

- 数据表 `AuditLog`（`prisma/schema.prisma`），字段：`actor_id` / `actor_email` / `action`
  （CREATE / UPDATE / DELETE / LOGIN）/ `entity_type` / `entity_id` / `detail` / `created_at`。
- actor 采用冗余快照（id + email）而非外键：管理员被删除后日志仍可追溯。
- 写入走 `lib/audit-log.ts` 的 `recordAuditLog()`，旁路失败不影响业务（写失败只打错误日志）。

当前记录的事件：

| 事件 | action | entityType |
|---|---|---|
| 登录成功 | LOGIN | user |
| 站点创建 / 编辑 / 删除 | CREATE / UPDATE / DELETE | site |
| 站点置顶、发布状态翻转、排序调整 | UPDATE | site |
| 分类创建 / 编辑 / 删除 / 排序 | CREATE / UPDATE / DELETE | category |
| 工作区创建 / 编辑 / 删除 / 设为默认 | CREATE / UPDATE / DELETE | workspace |
| 域名绑定 / 解绑 | CREATE / DELETE | domain |
| 系统设置更新 | UPDATE | settings |
| 插件启停 / 配置修改 | UPDATE | plugin |
| 插件上传 / 删除 | CREATE / DELETE | plugin |
| 数据导入（JSON / 全量备份 / 浏览器书签） | CREATE | site |
| 新增管理员 | CREATE | user |
| 编辑管理员 / 调整角色 | UPDATE | user |
| 重置他人密码 | UPDATE | user |
| 本人改密 | UPDATE | user |
| 删除管理员 | DELETE | user |

日志查看页（`/admin/audit`，仅超管）支持：

- 按**操作类型**（创建 / 更新 / 删除 / 登录）与**对象类型**（账号 / 站点 / 分类 / 工作区 / 域名 / 插件 / 系统设置）筛选；
- 关键字搜索，命中操作者邮箱、详情文本或对象 ID。

保留策略：

- 审计日志**保留 90 天**（`AUDIT_LOG_RETENTION_DAYS`），过期条目在写入与查询时惰性清理
  （每个进程每小时最多执行一次 `deleteMany`，多实例部署下幂等无害）。
- 审计的定位是「近期操作可追溯」而非永久存档，需要长期留存的实例请自行定期导出归档。

已知边界：

- `detail` 为中文自然语言（如「创建管理员 a@b.com（角色 ADMIN）」），不随界面语言切换。

## 5. 新装与升级

### 全新部署

`prisma/seed.ts` 创建的初始账号（`ADMIN_EMAIL` / `ADMIN_PASSWORD`）固定为 SUPER_ADMIN——
环境变量由部署方掌控，是系统的信任锚点。

### 从单管理员版本升级

1. 执行迁移：
   - PostgreSQL：`npm run db:migrate:deploy`
   - SQLite（默认）：`npm run db:push`（自动建 AuditLog 表）
   - Docker：`entrypoint.sh` 启动时自动完成
2. **已有账号角色不变**，全部保持 ADMIN。也就是说升级后没有任何超管，
   用户管理与审计日志入口不会出现。用 SQL 把信任账号提升为超管：

```sql
UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "email" = 'you@example.com';
```

3. 重新登录一次（旧 token 缺少 iat 字段时会被改密吊销逻辑拒绝，属预期行为）。

> PostgreSQL 需 12+：迁移使用 `ALTER TYPE ... ADD VALUE`，低版本不允许在事务块内执行。

### 超管密码遗失

超管不可被删除，也不可被其他超管重置，恢复方式是直连数据库改密码哈希：

```bash
# 生成 bcrypt 哈希（cost 10，与项目一致）
node -e "console.log(require('bcryptjs').hashSync('new-password',10))"
```

```sql
UPDATE "User" SET "password" = '<hash>', "password_changed_at" = now() WHERE "email" = 'you@example.com';
```

> 重新 seed 不会覆盖已存在的账号，因此不能靠 seed 找回密码。

## 6. 扩展角色

在 `lib/roles.ts` 的 `ADMIN_ROLES` 与判定函数里扩展，并同步：

1. `prisma/schema.prisma` 的 `enum UserRole` 与一条新迁移；
2. `middleware.ts`、`lib/api-auth.ts`、`lib/actions.ts` 中需要新角色的闸门；
3. `components/admin/admin-sidebar.tsx` 的入口展示。
