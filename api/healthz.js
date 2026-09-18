// GET /healthz — 健康检查（公开。只报“令牌配没配”，绝不回显令牌本身）
import { healthPayload } from "../server.mjs";

export default function handler(_req, res) {
  res.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(healthPayload()));
}
