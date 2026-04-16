import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 仅在非生产环境创建测试数据
  if (process.env.NODE_ENV !== "production") {
    const testUser = await prisma.user.upsert({
      where: { email: "test@example.com" },
      update: {},
      create: {
        email: "test@example.com",
        displayName: "Test User",
        passwordSalt: "placeholder_salt",
        passwordHash: "$argon2i$v=19$m=65536,t=3,p=4$...", // 占位符，实际使用时需要哈希
        locale: "zh-CN",
      },
    });
    console.log(`Created test user: ${testUser.email}`);
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });