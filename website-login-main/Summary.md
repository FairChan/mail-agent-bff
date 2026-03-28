# MailPilot 项目摘要

## 项目简介
- 项目类型：邮件助手认证原型
- 技术栈：React + Vite + TypeScript + React Router + Express BFF
- 目标：实现一个浅色未来感的登录 / 注册界面，并通过同仓 BFF 落地登录、注册、会话恢复与登出闭环，支持中英整页切换。

## 代码架构
- `src/App.tsx`：应用入口路由，负责登录/注册/收件箱路由、页面标题与全局语言状态。
- `shared/auth.ts`：前后端共享认证契约，统一用户类型、请求体和错误响应结构。
- `src/content/messages.ts`：中英文案中心，统一管理品牌文案、表单文案和校验文案。
- `src/components/auth/AuthShell.tsx`：认证页共享外壳，负责品牌展示区、语言切换与双栏布局。
- `src/components/ui/*`：表单输入、密码显隐、复选框、状态提示、第三方按钮等基础 UI。
- `src/pages/LoginPage.tsx`：登录页表单状态、登录校验、真实认证提交与错误回填。
- `src/pages/RegisterPage.tsx`：注册页表单状态、注册校验、真实认证提交与错误回填。
- `src/pages/InboxPage.tsx`：登录后的最小受保护页面，展示当前用户信息并提供退出入口。
- `src/context/AuthProvider.tsx`：前端认证状态中心，负责 `/api/auth/me` 初始化、登录、注册与登出。
- `src/components/auth/RouteGuards.tsx`：路由守卫，分别处理公开页和受保护页的访问控制。
- `src/lib/authApi.ts`：前端对 `/api/auth/*` 的统一请求封装，自动携带 `credentials: 'include'` 与 `X-Locale`。
- `src/lib/authFeedback.ts` / `src/lib/formErrors.ts`：认证失败反馈与字段错误消息归一化工具。
- `src/utils/validation.ts`：登录 / 注册前端校验逻辑，当前返回稳定错误 key，再由页面按当前语言解析成文案。
- `src/index.css`：浅色未来感主题、布局、玻璃质感、动画与响应式样式。
- `bff/src/app.ts`：BFF 应用入口，负责中间件、健康检查、认证路由挂载与生产环境静态托管。
- `bff/src/routes/auth.ts`：`/api/auth/login`、`/register`、`/me`、`/logout` 四个认证接口。
- `bff/src/auth/*`：Cookie 读写、输入校验、认证提供器抽象，以及 mock / upstream 两种认证来源适配。
- `bff/src/config.ts`：BFF 环境配置与 Cookie/上游接口路径管理。

## 更新记录
- 初始化 React + Vite(TypeScript) 项目结构，并重建为邮件助手认证原型基础架构。
- 新增共享认证布局、登录页、注册页、中英语言切换、前端表单校验与浅色未来感视觉系统。
- 根据子代理审计修正原型细节：补齐语言切换下的状态文案同步、密码显隐无障碍文案、确认密码实时校验、Google 演示反馈、复选框键盘焦点态与浅色主题文字对比度。
- 为了让原型在纯静态托管环境中直接打开也可用，路由切换为 hash 模式，避免 `/login`、`/register` 深链刷新出现 404。
- 调整 Vite 构建基路径与 favicon 引用为相对资源路径，提升子路径静态部署兼容性。
- 补齐页面级 `<h1>` 语义与动态 `document.title` 更新，让登录/注册页在桌面、移动端和中英切换下都保持一致的标题语义。
- 修复表单校验文案不会随中英切换同步更新的问题：错误状态改为存储稳定 key，由当前语言字典实时解析，避免出现中文页面混杂英文报错或英文页面混杂中文报错。
- 修复字段在继续输入但仍不合法时错误提示被提前清空的问题：仅在已有错误的字段上进行实时重算，同时保留密码与确认密码的联动校验。
- 忽略 Playwright 与本地运行调试产物，避免浏览器调试文件污染仓库。
- 接入前端真实认证流程：新增 AuthProvider/useAuth、`/api/auth/*` 请求封装、登录/注册成功后的 `/inbox` 路由跳转，以及带退出登录的最小受保护页面。
- 为认证流程补充路由守卫与统一错误反馈：未登录访问 `/inbox` 自动回跳登录页，登录/注册接口错误可回填字段并显示浅色风格状态提示。
- 新增受保护页面的浅色卡片样式与会话状态展示，让登录后落点仍与原有 MailPilot 视觉体系保持一致。
- 新增同仓 Express BFF：提供 `/api/auth/login`、`/api/auth/register`、`/api/auth/me`、`/api/auth/logout`，并用 HttpOnly Cookie 承接前端会话。
- 根脚本升级为双进程开发模式：`npm run dev` 同时启动 Vite 与 BFF，`vite.config.ts` 新增 `/api` 代理，`npm run build` 同时产出 Web 与 BFF 构建结果。
- BFF 增加 mock / upstream 双认证提供器：本地默认可直接跑通演示账号，后续可通过环境变量映射到真实主后端模块。
- 修正认证错误国际化细节：BFF 优先返回稳定错误 key，前端统一按当前语言解析 banner 与字段错误，避免中文界面出现英文认证报错。
- 收敛 Cookie 记住我语义：`remember=false` 仅写会话级主 Cookie，`remember=true` 才追加持久 refresh Cookie，避免旧 refresh Cookie 污染新的短会话登录。
- 修复访客打开登录 / 注册页时浏览器控制台出现 `/api/auth/me` 401 噪音的问题：BFF 对“未登录”会话探测改为返回 204，前端按游客态处理，不再制造误导性的红色报错。
