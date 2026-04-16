/**
 * OAuth2 授权脚本
 * 运行此脚本生成授权链接，完成授权后获得 Refresh Token
 * 
 * 使用方法:
 *   1. 运行脚本: npx tsx scripts/get-oauth-token.ts
 *   2. 浏览器打开生成的链接
 *   3. 使用 mery.secretary@gmail.com 登录并授权
 *   4. 复制授权页面中的 code 参数
 *   5. 粘贴 code 到终端
 *   6. 获得 refresh_token（妥善保存！）
 */
import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.OAUTH_CLIENT_ID || "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || "YOUR_CLIENT_SECRET";
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || "http://localhost:3000/oauth/callback";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
];

const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent", // 强制显示 consent 以获取 refresh_token
});

console.log("\n==========================================");
console.log("🔗 请在浏览器中打开以下链接并授权:");
console.log("==========================================\n");
console.log(authUrl);
console.log("\n==========================================\n");
console.log("授权后，浏览器会跳转到类似这样的页面:");
console.log("  http://localhost:3000/oauth/callback?code=XXXXX&scope=...");
console.log("\n请复制 URL 中的 code 参数值，粘贴到下面:\n");

// 读取用户输入的 code
const readline = await readUserInput();

if (!readline) {
  console.error("未提供 code，程序退出");
  process.exit(1);
}

const code = readline.trim();

console.log("\n正在交换 token...\n");

try {
  const { tokens } = await oAuth2Client.getToken(code);
  
  console.log("==========================================");
  console.log("✅ 授权成功！以下是你的凭证:");
  console.log("==========================================\n");
  console.log(`access_token: ${tokens.access_token}`);
  console.log(`refresh_token: ${tokens.refresh_token}`);
  console.log(`expiry_date: ${tokens.expiry_date}`);
  console.log("\n==========================================");
  console.log("⚠️  请妥善保管 refresh_token！");
  console.log("⚠️  它只能获取一次，丢失后需要重新授权。");
  console.log("==========================================\n");
  
  // 输出 .env 配置
  console.log("请将以下内容添加到 .env 文件:\n");
  console.log("# ---- Gmail OAuth2 Config ----");
  console.log(`OAUTH_CLIENT_ID=${CLIENT_ID}`);
  console.log(`OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
  console.log(`OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log(`OAUTH_USER=mery.secretary@gmail.com`);
  
} catch (error) {
  console.error("获取 token 失败:", error);
  process.exit(1);
}

async function readUserInput(): Promise<string> {
  const stdin = process.stdin;
  return new Promise((resolve) => {
    stdin.setEncoding("utf8");
    let data = "";
    
    const timeout = setTimeout(() => {
      stdin.pause();
      resolve("");
    }, 120_000); // 2分钟超时
    
    stdin.once("data", (chunk) => {
      clearTimeout(timeout);
      data += chunk;
      resolve(data);
    });
    
    stdin.resume();
  });
}