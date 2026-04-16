/**
 * 直接交换 OAuth2 code 获取 tokens
 */
import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = process.env.OAUTH_CLIENT_ID || "YOUR_CLIENT_ID";
const CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || "YOUR_CLIENT_SECRET";
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || "http://localhost:3000/oauth/callback";
const CODE = process.env.OAUTH_CODE; // Required: the authorization code from OAuth callback

async function main() {
  const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  
  console.log("正在交换 token...\n");
  
  try {
    const { tokens } = await oAuth2Client.getToken(CODE);
    
    console.log("==========================================");
    console.log("✅ 授权成功！");
    console.log("==========================================\n");
    console.log(`refresh_token: ${tokens.refresh_token}`);
    console.log(`access_token: ${tokens.access_token}`);
    console.log(`expiry_date: ${tokens.expiry_date}`);
    console.log("\n==========================================");
    console.log("⚠️  请妥善保管 refresh_token！");
    console.log("⚠️  丢失后需要重新授权整个流程。");
    console.log("==========================================\n");
    
    // 输出 .env 配置
    console.log("请将以下内容添加到 .env 文件:\n");
    console.log("# ---- Gmail OAuth2 Config ----");
    console.log(`OAUTH_CLIENT_ID=${CLIENT_ID}`);
    console.log(`OAUTH_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`OAUTH_USER=mery.secretary@gmail.com`);
    console.log(`SMTP_ENABLED=true`);
    
  } catch (error) {
    console.error("获取 token 失败:", error);
    process.exit(1);
  }
}

main();
