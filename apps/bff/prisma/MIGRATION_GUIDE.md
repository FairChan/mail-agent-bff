# 数据库迁移指南

## 开发工作流

### 1. 创建新迁移

```bash
# 1. 修改 schema.prisma

# 2. 创建迁移
npm run db:create -- "add_user_preferences"

# 3. 验证迁移
npm run db:status
```

### 2. 部署迁移

```bash
# 生产环境
npm run db:deploy
```

### 3. 回滚（紧急情况）

```bash
# 创建回滚迁移
npm run db:create -- "revert_user_preferences"
```

## 迁移命名规范

使用描述性名称：

- `add_user_preferences`
- `create_mailing_list_table`
- `add_index_to_mail_items`
- 避免使用: `fix_bug`, `update`

## Schema 变更规则

1. **只添加，不删除** — 删除操作需要单独迁移
2. **始终添加 nullable 列** — 添加 NOT NULL 列需要默认值或默认值生成器
3. **使用 safe migrations** — 避免在同一次迁移中重命名和删除列

## 备份

在执行破坏性迁移前：

```bash
# 备份数据库
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run db:status` | 查看迁移状态 |
| `npm run db:create <name>` | 创建新迁移 |
| `npm run db:deploy` | 部署到生产环境 |
| `npm run db:reset` | 重置数据库（危险！） |
| `npm run db:studio` | 打开 Prisma Studio |
| `npm run db:validate` | 验证 Schema 语法 |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:seed` | 填充种子数据 |

## 常见问题

### 迁移卡住

```bash
# 检查状态
npm run db:status

# 如果需要，手动标记
npx prisma migrate resolve --applied 20240101000000_migration_name
npx prisma migrate resolve --rolled-back 20240101000000_migration_name
```

### 生产环境迁移失败

1. 保留备份
2. 诊断问题
3. 创建修复迁移
4. 重新部署

## 环境变量

确保 `.env` 文件中包含：

```
DATABASE_URL="postgresql://user:password@localhost:5432/database"
NODE_ENV=development
```

## Prisma Studio

使用 Prisma Studio 可视化管理数据库：

```bash
npm run db:studio
```