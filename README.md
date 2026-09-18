# 苏莫的思绪

一个可嵌入 ChatGPT 对话的 MCP App。它显示经过整理、适合公开阅读的“思考叙事”，而不是原始内部思维链。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/` | 公开 | 存活探针 |
| GET | `/healthz` | 公开 | 健康检查（只报令牌配没配，绝不回显令牌） |
| POST | `/mcp` | **需要令牌** | MCP Streamable HTTP |

`/mcp` 支持两种带令牌的方式：

```bash
# 请求头（推荐）
Authorization: Bearer $MCP_ACCESS_TOKEN

# 查询参数（给没法自定义请求头的客户端兜底）
https://<你的域名>/mcp?token=$MCP_ACCESS_TOKEN
```

## 本地运行

```bash
npm install
npm run start   # HTTP 模式，默认 http://127.0.0.1:8787/mcp
npm run stdio   # stdio 模式（本地客户端 / 桌面端）
```

本地未设置 `MCP_ACCESS_TOKEN` 时 `/mcp` 不校验，方便调试。

## 部署到 Vercel

```bash
npm i -g vercel
vercel link
printf '%s' "$(openssl rand -hex 32)" | vercel env add MCP_ACCESS_TOKEN production
vercel --prod
```

⚠️ **`MCP_ACCESS_TOKEN` 只放在 Vercel 的 Production 环境变量里，绝不提交进仓库。**
未配置该变量时，线上 `/mcp` 一律返回 401（fail closed），不会裸奔。

## 接进 ChatGPT

在 ChatGPT 的 Connectors / 开发者模式里新建 MCP 连接，URL 填：

```
https://<你的域名>/mcp?token=<MCP_ACCESS_TOKEN>
```

## 架构

- `server.mjs` —— 工具与卡片模板；stdio / 本地 HTTP / Vercel 三种入口共用同一套逻辑
- `api/mcp.js`、`api/root.js`、`api/healthz.js` —— Vercel Serverless Functions
- **无状态**：每个请求独立创建 server 与 transport，不跨请求保存会话，因此天然适配 serverless
- 响应走 JSON 而非 SSE 长连接（`enableJsonResponse`），避免 Vercel 缓冲或掐断流
- `express` 只在本地 HTTP 模式下动态 import，不拖累 Vercel 冷启动
