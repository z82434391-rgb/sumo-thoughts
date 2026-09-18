// Vercel Serverless Function — MCP Streamable HTTP 入口
// 无状态：每个请求独立建 server + transport，不跨请求保存会话，适配 serverless。
import { handleMcpRequest, isAuthorized } from "../server.mjs";

function setCors(res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, authorization, mcp-protocol-version, mcp-session-id");
  res.setHeader("access-control-expose-headers", "mcp-session-id, mcp-protocol-version");
}

// Vercel 有时已经帮我们解析过 body，有时没有——两种情况都要能接住。
async function readBody(req) {
  const raw = req.body;
  if (raw !== undefined && raw !== null) {
    if (typeof raw === "string") {
      try { return JSON.parse(raw); } catch { return undefined; }
    }
    if (Buffer.isBuffer(raw)) {
      try { return JSON.parse(raw.toString("utf8")); } catch { return undefined; }
    }
    return raw;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { return undefined; }
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (!isAuthorized(req)) {
    res.writeHead(401, {
      "content-type": "application/json; charset=utf-8",
      "www-authenticate": 'Bearer realm="sumo-thoughts"',
    });
    return res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null }));
  }

  const body = req.method === "POST" || req.method === "DELETE" ? await readBody(req) : undefined;
  return handleMcpRequest(req, res, body);
}
