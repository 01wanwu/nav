-- 多管理员权限体系：
-- 1) UserRole 新增 SUPER_ADMIN（超管），与 ADMIN（普通管理员）平级共存；
-- 2) 新增 AuditLog 审计日志表（多管理员协作下记录"谁在何时做了什么"）。

-- AlterEnum：PostgreSQL 原生枚举类型追加值（安全操作，不重建表）
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN');

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");
CREATE INDEX "AuditLog_actor_id_idx" ON "AuditLog"("actor_id");
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity_type", "entity_id");

-- 历史数据迁移：现有 ADMIN 用户角色语义不变，维持 ADMIN；
-- 部署方可用 SQL 手工将信任账号提升为 SUPER_ADMIN：
-- UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "email" = 'xxx@example.com';
