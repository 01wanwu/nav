# Admin Roles & Permissions

> Applies to versions after the `SUPER_ADMIN` / `ADMIN` two-tier roles were introduced
> (migration `20260907000000_multi_admin`).
> Source: `lib/roles.ts`, `lib/api-auth.ts`, `lib/audit-log.ts`, `lib/actions.ts`, `middleware.ts`.
> 中文版：[admin-permissions.zh-CN.md](./admin-permissions.zh-CN.md)

## 1. Role model

| | Super admin `SUPER_ADMIN` | Admin `ADMIN` |
|---|---|---|
| Sites / categories / workspaces / plugins / data import-export | ✅ | ✅ |
| System settings (`/admin/settings`) | ✅ | ✅ |
| User management (`/admin/users`: create, edit, delete, reset password, change role) | ✅ | ❌ |
| Audit log (`/admin/audit`) | ✅ | ❌ |
| Edit own profile and password (sidebar avatar) | ✅ | ✅ |

- Two tiers, not an inheritance chain: `SUPER_ADMIN` has every content-maintenance capability of
  `ADMIN` plus account management and auditing.
- All role checks funnel through `lib/roles.ts` (`hasAdminRole` / `isSuperAdminRole`).
  Change that single file when adding roles — never scatter `role === "ADMIN"` checks around the codebase.

## 2. Self-protection rules

1. **The database is the source of truth for roles.** The role inside the session token is only a
   coarse pre-filter; `getAdminSession()` re-reads the database on every call. A demoted account
   loses access immediately — no need to wait for the 7-day token to expire.
2. **Password change revokes sessions.** Changing or resetting a password writes
   `User.passwordChangedAt`; every token issued before that moment becomes invalid and all
   signed-in devices of that account are logged out.
3. **Super admins are the trust anchor.** A super admin account cannot be deleted, demoted, or have
   its password reset by *another* super admin (resetting a password is account takeover, the same
   trust boundary as delete/demote). Demotion is only possible by changing your own password or by
   editing the database directly.
4. **No self-sabotage.** You cannot delete yourself or change your own role (so the last super admin
   cannot lock themselves out). Resetting your own password is allowed — it is just a password change.
5. **You may only edit your own profile.** `updateUser` accepts only the session owner's id and
   rejects any other id (Server Actions are publicly callable RPCs, so a client-supplied target id
   cannot be trusted).

## 3. Where the checks live

| Location | What it guards | Check |
|---|---|---|
| `middleware.ts` | `/admin/**` pages redirect to login when unauthenticated; `/api/admin/**` (except `login`, `status`) returns 401 | `hasAdminRole` |
| `app/api/admin/login/route.ts` | Non-admin accounts are rejected with 403 at sign-in | `hasAdminRole` |
| `getAdminSession()` in `lib/api-auth.ts` | Signature verification + DB lookup + password-change revocation; returns the DB role | `hasAdminRole` |
| `lib/actions.ts` | `requireAdmin()` for every content action; `requireSuperAdmin()` for user management and audit log | per operation |
| Page server components | `/admin/users` and `/admin/audit` redirect non-super-admins to the dashboard | role is not `SUPER_ADMIN` |

The sidebar hides the "Users" / "Audit Log" entries per role (`components/admin/admin-sidebar.tsx`
reads `role` from `/api/admin/me`). Hiding the entry is presentation only — the server-side checks
above are the real defence.

## 4. Audit log

- Table `AuditLog` (`prisma/schema.prisma`) with `actor_id` / `actor_email` / `action`
  (CREATE / UPDATE / DELETE / LOGIN) / `entity_type` / `entity_id` / `detail` / `created_at`.
- The actor is stored as a **redundant snapshot** (id + email) instead of a foreign key, so entries
  stay readable after the acting admin is deleted.
- Writes go through `recordAuditLog()` in `lib/audit-log.ts` and are best-effort:
  a failed write never blocks the business operation (it only logs an error).

Events recorded today:

| Event | action | entityType |
|---|---|---|
| Successful sign-in | LOGIN | user |
| Site created / edited / deleted | CREATE / UPDATE / DELETE | site |
| Site pin toggle, publish toggle, reordering | UPDATE | site |
| Category created / edited / deleted / reordered | CREATE / UPDATE / DELETE | category |
| Workspace created / edited / deleted / set as default | CREATE / UPDATE / DELETE | workspace |
| Domain bound / unbound | CREATE / DELETE | domain |
| System settings updated | UPDATE | settings |
| Plugin enabled-disabled / config changed | UPDATE | plugin |
| Plugin uploaded / deleted | CREATE / DELETE | plugin |
| Data import (JSON / full backup / browser bookmarks) | CREATE | site |
| Admin created | CREATE | user |
| Admin edited / role changed | UPDATE | user |
| Password reset for someone else | UPDATE | user |
| Own password changed | UPDATE | user |
| Admin deleted | DELETE | user |

The audit log page (`/admin/audit`, super admin only) supports:

- filtering by **action type** (create / update / delete / sign-in) and by **object type**
  (account / site / category / workspace / domain / plugin / system settings);
- keyword search matching the actor's email, the detail text, or the object ID.

Retention:

- Audit entries are kept for **90 days** (`AUDIT_LOG_RETENTION_DAYS`). Expired entries are pruned
  lazily on writes and queries (at most one `deleteMany` per process per hour; idempotent and
  harmless under multi-instance deployments).
- The audit trail targets "recent operations are traceable", not permanent archiving. Export and
  archive periodically if you need long-term retention.

Known limits:

- `detail` is stored as Chinese natural language (e.g. "创建管理员 a@b.com（角色 ADMIN）") and is not
  localised.

## 5. Fresh install and upgrade

### Fresh install

The initial account created by `prisma/seed.ts` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) is always a
`SUPER_ADMIN` — those environment variables are controlled by the operator and are the trust anchor.

### Upgrading from the single-admin version

1. Run the migration:
   - PostgreSQL: `npm run db:migrate:deploy`
   - SQLite (default): `npm run db:push` (creates the `AuditLog` table)
   - Docker: `entrypoint.sh` does this automatically on start
2. **Super admin is filled in automatically.** Existing accounts are never rewritten wholesale, but a
   system without a single super admin is an unusable intermediate state, so startup performs a
   one-off fix-up: if no `SUPER_ADMIN` exists, the **oldest** admin account is promoted
   (`scripts/ensure-super-admin.mjs`, run by Docker and by `npm run db:ensure-super-admin`).
   It is idempotent and promotion-only: nothing happens once a super admin exists.
3. To move the super admin role to a different account, promote the new one first, then demote the old
   one (never the other way round, or you briefly end up with no super admin):

```sql
UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "email" = 'new-owner@example.com';
UPDATE "User" SET "role" = 'ADMIN'      WHERE "email" = 'old-owner@example.com';
```

4. Sign in again (old tokens without the `iat` claim are rejected by the revocation check — expected).

> PostgreSQL 12+ is required: the migration uses `ALTER TYPE ... ADD VALUE`, which older versions do
> not allow inside a transaction block.

### Lost super admin password

A super admin cannot be deleted and its password cannot be reset by another super admin, so recovery
means updating the hash directly:

```bash
node -e "console.log(require('bcryptjs').hashSync('new-password',10))"
```

```sql
UPDATE "User" SET "password" = '<hash>', "password_changed_at" = now() WHERE "email" = 'you@example.com';
```

> Re-running the seed does not overwrite an existing account, so it cannot be used for recovery.

## 6. Adding a role

Extend `ADMIN_ROLES` and the helpers in `lib/roles.ts`, then keep in sync:

1. `enum UserRole` in `prisma/schema.prisma` plus a new migration;
2. the gates in `middleware.ts`, `lib/api-auth.ts` and `lib/actions.ts` that should accept it;
3. the sidebar entries in `components/admin/admin-sidebar.tsx`.
