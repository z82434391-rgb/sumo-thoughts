// GET / — 存活探针（公开，不含任何敏感信息）
import { SERVICE } from "../server.mjs";

export default function handler(_req, res) {
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(`${SERVICE.name} v${SERVICE.version} — 苏莫的思绪 MCP App is awake.\nMCP endpoint: POST /mcp\n`);
}
