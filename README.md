# 苏莫的思绪

一个可嵌入 ChatGPT 对话的 MCP App。它显示经过整理、适合公开阅读的“思考叙事”，而不是原始内部思维链。

## 本地运行

```bash
npm install
npm run start
```

HTTP MCP 入口：`http://127.0.0.1:8787/mcp`

也可通过 stdio 启动：

```bash
npm run stdio
```

要连接 ChatGPT 网页版，需要把 `/mcp` 暴露为 HTTPS 地址，或在开发者模式中使用 Secure MCP Tunnel。

