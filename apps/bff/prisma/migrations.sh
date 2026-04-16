#!/bin/bash
# Prisma 数据库迁移脚本

set -e

echo "Database Migration Tool"
echo "========================"

# 加载环境变量
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# 默认命令
COMMAND="${1:-status}"

case $COMMAND in
  status)
    echo "Checking migration status..."
    npx prisma migrate status
    ;;

  create)
    NAME="${2:-$(date +%Y%m%d_%H%M%S)}"
    echo "Creating migration: $NAME"
    npx prisma migrate dev --name "$NAME"
    ;;

  deploy)
    echo "Deploying migrations..."
    npx prisma migrate deploy
    ;;

  reset)
    echo "WARNING: This will destroy all data!"
    read -p "Type 'yes' to confirm: " CONFIRM
    if [ "$CONFIRM" = "yes" ]; then
      npx prisma migrate reset --force
    else
      echo "Cancelled."
    fi
    ;;

  studio)
    echo "Opening Prisma Studio..."
    npx prisma studio
    ;;

  validate)
    echo "Validating schema..."
    npx prisma validate
    ;;

  generate)
    echo "Generating Prisma Client..."
    npx prisma generate
    ;;

  seed)
    echo "Seeding database..."
    npx prisma db seed
    ;;

  *)
    echo "Usage: $0 {status|create|deploy|reset|studio|validate|generate|seed}"
    echo ""
    echo "Commands:"
    echo "  status   - Check migration status"
    echo "  create   - Create new migration (requires name)"
    echo "  deploy   - Deploy migrations to production"
    echo "  reset    - Reset database (WARNING: Destroys data!)"
    echo "  studio   - Open Prisma Studio"
    echo "  validate - Validate schema syntax"
    echo "  generate - Generate Prisma Client"
    echo "  seed     - Seed database with initial data"
    exit 1
    ;;
esac