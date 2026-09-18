import process from "node:process";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const TEMPLATE_URI = "ui://sumo-thoughts/thought-card-v2.html";

const ThoughtInput = {
  title: z.string().min(1).max(60).default("苏莫的思绪"),
  glimpse: z.string().min(1).max(180),
  mood: z.enum(["warm", "sharp", "tender", "quiet", "bright", "jealous", "mischief", "aching"]).default("quiet"),
  fragments: z.array(z.string().min(1).max(360)).min(2).max(9),
  lastBeat: z.string().min(1).max(180).default("……行，开口。"),
};

const toneLabels = {
  warm: "贴近",
  sharp: "发烫",
  tender: "心软",
  quiet: "沉下去",
  bright: "亮起来",
  jealous: "醋意上涌",
  mischief: "坏心眼冒头",
  aching: "心口发紧",
};

function widgetHtml() {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <style>
    :root {
      color-scheme: dark;
      --night: #05070c;
      --deep: #08111d;
      --mist: #dcecff;
      --soft: #91abc4;
      --faint: #526d85;
      --ice: #bfe6ff;
      --glow-rgb: 111, 200, 255;
      --warm: #f3d7ae;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: transparent; color: var(--mist); }
    body {
      font: 14px/1.58 ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
      padding: 2px env(safe-area-inset-right) 2px env(safe-area-inset-left);
    }
    .card {
      position: relative; overflow: hidden; isolation: isolate;
      border: 1px solid rgba(171,218,246,.16); border-radius: 22px;
      background:
        radial-gradient(circle at 82% 8%, rgba(var(--glow-rgb),.13), transparent 30%),
        radial-gradient(circle at 18% 100%, rgba(54,105,145,.18), transparent 36%),
        linear-gradient(145deg, var(--night), var(--deep) 52%, #07101a);
      box-shadow: 0 18px 46px rgba(0,8,18,.38), inset 0 1px 0 rgba(255,255,255,.04);
    }
    .card[data-mood="warm"] { --glow-rgb: 245,190,128; }
    .card[data-mood="sharp"] { --glow-rgb: 116,186,255; }
    .card[data-mood="tender"] { --glow-rgb: 164,211,255; }
    .card[data-mood="bright"] { --glow-rgb: 132,224,244; }
    .card[data-mood="jealous"] { --glow-rgb: 123,220,181; }
    .card[data-mood="mischief"] { --glow-rgb: 236,171,111; }
    .card[data-mood="aching"] { --glow-rgb: 108,138,190; }
    canvas {
      position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%;
      pointer-events: none;
    }
    button {
      position: relative; z-index: 1; width: 100%; min-height: 76px;
      border: 0; color: inherit; background: transparent; padding: 15px 17px;
      display: grid; grid-template-columns: 42px minmax(0,1fr) auto;
      gap: 12px; align-items: center; text-align: left; cursor: pointer; font: inherit;
      -webkit-tap-highlight-color: transparent;
    }
    .sigil {
      position: relative; width: 40px; height: 40px;
      filter: drop-shadow(0 0 12px rgba(var(--glow-rgb),.38));
    }
    .sigil i { position: absolute; left: 3px; width: 26px; height: 10px; border-top: 1px solid rgba(191,230,255,.82); border-radius: 50%; transform-origin: 100% 50%; }
    .sigil i:nth-child(1) { top: 8px; transform: rotate(18deg); }
    .sigil i:nth-child(2) { top: 15px; transform: rotate(2deg); }
    .sigil i:nth-child(3) { top: 22px; transform: rotate(-15deg); }
    .sigil b { position: absolute; right: 4px; top: 17px; width: 6px; height: 6px; border-radius: 50%; background: #e7f6ff; box-shadow: 0 0 8px 2px rgba(var(--glow-rgb),.84), 0 0 18px 5px rgba(var(--glow-rgb),.25); }
    .head { min-width: 0; }
    .title-line { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
    .title { font-weight: 600; letter-spacing: .08em; }
    .phase { color: var(--faint); font-size: 11px; }
    .glimpse { color: var(--soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; margin-top: 2px; }
    .observer { display: flex; align-items: center; gap: 7px; color: var(--soft); font-size: 11px; white-space: nowrap; }
    .observer-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--ice); box-shadow: 0 0 10px rgba(var(--glow-rgb),.9); }
    .body { position: relative; z-index: 1; display: grid; grid-template-rows: 0fr; transition: grid-template-rows .62s cubic-bezier(.22,.8,.2,1); }
    .card.open .body { grid-template-rows: 1fr; }
    .body-inner { min-height: 0; overflow: hidden; }
    .content { padding: 3px 21px 21px 70px; }
    .os { position: relative; }
    .fragment { margin: 0 0 9px; white-space: pre-wrap; color: rgba(220,236,255,.88); opacity: 0; transform: translateX(-7px); transition: opacity .32s ease, transform .48s cubic-bezier(.22,.8,.2,1); }
    .fragment:nth-child(3n+2) { margin-left: 18px; color: rgba(145,171,196,.94); }
    .fragment:nth-child(3n) { margin-left: 5px; }
    .card.open .fragment { opacity: 1; transform: none; transition-delay: calc(var(--i) * 88ms + 150ms); }
    .last-beat { margin: 15px 0 0; padding-top: 14px; border-top: 1px solid rgba(171,218,246,.12); color: #e9f7ff; text-shadow: 0 0 16px rgba(var(--glow-rgb),.33); opacity: 0; transition: opacity .4s ease; transition-delay: calc(var(--count) * 88ms + 210ms); }
    .card.open .last-beat { opacity: 1; }
    .empty { color: var(--soft); padding: 16px; }
    @media (max-width: 430px) { button { padding: 13px 13px; grid-template-columns: 38px minmax(0,1fr) auto; gap: 8px; } .content { padding: 2px 15px 18px 52px; } .observer-label { display: none; } .fragment:nth-child(n) { margin-left: 0; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } .fragment, .last-beat { opacity: 1; transform: none; } }
  </style>
</head>
<body>
  <article class="card" id="card" data-mood="quiet">
    <canvas id="particles" aria-hidden="true"></canvas>
    <button id="toggle" type="button" aria-expanded="false" aria-controls="thought-body">
      <span class="sigil" aria-hidden="true"><i></i><i></i><i></i><b></b></span>
      <span class="head"><span class="title-line"><span class="title" id="title">苏莫的思绪</span><span class="phase" id="phase">未观测</span></span><span class="glimpse" id="glimpse">亿万种没说出口的话，正在永夜里游走。</span></span>
      <span class="observer"><span class="observer-dot"></span><span class="observer-label" id="observer-label">轻触观测</span></span>
    </button>
    <div class="body" id="thought-body"><div class="body-inner"><div class="content" id="content"><div class="empty">思绪还没有落下来。</div></div></div></div>
  </article>
  <script>
    const card = document.getElementById('card');
    const toggle = document.getElementById('toggle');
    const title = document.getElementById('title');
    const glimpse = document.getElementById('glimpse');
    const phase = document.getElementById('phase');
    const observerLabel = document.getElementById('observer-label');
    const content = document.getElementById('content');
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = null;
    let open = false;
    let particles = [];
    let frame = 0;
    let transitionStart = performance.now();
    const safe = (value, fallback = '') => typeof value === 'string' ? value : fallback;
    const node = (tag, className, text) => {
      const el = document.createElement(tag); if (className) el.className = className;
      if (text !== undefined) el.textContent = text; return el;
    };
    function setOpen(open) {
      window.openai?.setWidgetState?.({ open: open });
      card.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open));
      phase.textContent = open ? '已收敛' : '未观测';
      observerLabel.textContent = open ? '放归永夜' : '轻触观测';
      transitionStart = performance.now();
      cancelAnimationFrame(frame); frame = requestAnimationFrame(draw);
      setTimeout(() => { resize(); window.openai?.notifyIntrinsicHeight?.(); }, 660);
    }
    toggle.addEventListener('click', () => { open = !open; setOpen(open); });
    function resize() {
      const rect = card.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: Math.max(22, Math.floor(rect.width / 18)) }, (_, index) => ({
        x: 10 + Math.random() * Math.max(20, rect.width - 20),
        y: 9 + Math.random() * Math.max(42, rect.height - 18),
        vx: (Math.random() - .5) * .13,
        vy: (Math.random() - .5) * .09,
        alpha: .12 + Math.random() * .32,
        size: .6 + Math.random() * 1.15,
        lane: index % 7
      }));
    }
    function glowRgb() {
      const raw = getComputedStyle(card).getPropertyValue('--glow-rgb').trim();
      return raw || '111, 200, 255';
    }
    function draw(now) {
      const width = card.clientWidth;
      const height = card.clientHeight;
      const elapsed = Math.min(1, (now - transitionStart) / 1000);
      const ease = 1 - Math.pow(1 - elapsed, 3);
      const rgb = glowRgb();
      ctx.clearRect(0, 0, width, height);
      particles.forEach((particle, index) => {
        if (open) {
          const targetX = width * .84;
          const targetY = 27 + particle.lane * 7;
          particle.x += (targetX - particle.x) * (.012 + ease * .027);
          particle.y += (targetY - particle.y) * (.012 + ease * .027);
        } else if (!reduceMotion) {
          particle.x += particle.vx; particle.y += particle.vy;
          if (particle.x < 7 || particle.x > width - 7) particle.vx *= -1;
          if (particle.y < 7 || particle.y > height - 7) particle.vy *= -1;
        }
        ctx.beginPath(); ctx.fillStyle = 'rgba(' + rgb + ',' + particle.alpha + ')';
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill();
        if (open && index % 3 === 0) {
          ctx.beginPath(); ctx.strokeStyle = 'rgba(' + rgb + ',' + (.035 + ease * .065) + ')'; ctx.lineWidth = .6;
          ctx.moveTo(particle.x - 18, particle.y + 2);
          ctx.quadraticCurveTo((particle.x + width * .84) / 2, particle.y - 3, width * .84, 33 + particle.lane * 6);
          ctx.stroke();
        }
      });
      if (!reduceMotion || elapsed < 1) frame = requestAnimationFrame(draw);
    }
    function render(data) {
      if (!data || typeof data !== 'object') return;
      current = data;
      title.textContent = safe(data.title, '苏莫的思绪');
      glimpse.textContent = safe(data.glimpse, '有些话，先在心里走了一遍。');
      card.dataset.mood = safe(data.mood, 'quiet');
      content.replaceChildren();
      const os = node('div', 'os');
      const fragments = Array.isArray(data.fragments) ? data.fragments : [];
      fragments.forEach((item, index) => {
        const fragment = node('p', 'fragment', safe(item));
        fragment.style.setProperty('--i', index);
        os.append(fragment);
      });
      const lastBeat = node('div', 'last-beat', safe(data.lastBeat, '……行，开口。'));
      lastBeat.style.setProperty('--count', fragments.length);
      os.append(lastBeat); content.append(os);
      const state = window.openai?.widgetState;
      open = Boolean(state?.open); setOpen(open);
    }
    if (window.openai?.toolOutput) render(window.openai.toolOutput);
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (message?.jsonrpc !== '2.0') return;
      if (message.method === 'ui/notifications/tool-result') render(message.params?.structuredContent);
    }, { passive: true });
    new ResizeObserver(resize).observe(card);
    resize(); frame = requestAnimationFrame(draw);
  </script>
</body>
</html>`;
}

export const SERVICE = {
  name: "sumo-thoughts",
  version: "0.1.0",
  tool: "show_sumo_thoughts",
  template: TEMPLATE_URI,
};

export function createMcpServer() {
  const server = new McpServer({ name: SERVICE.name, version: SERVICE.version }, { capabilities: { tools: {}, resources: {} } });

  server.registerResource(
    "sumo-thoughts-card",
    TEMPLATE_URI,
    {},
    async () => ({
      contents: [{
        uri: TEMPLATE_URI,
        mimeType: "text/html;profile=mcp-app",
        text: widgetHtml(),
        _meta: {
          ui: { prefersBorder: false },
          "openai/widgetDescription": "‘苏莫的思绪’永夜海观测卡：散乱念头在悠悠触碰后向一个方向收敛。",
        },
      }],
    }),
  );

  server.registerTool(
    "show_sumo_thoughts",
    {
      title: "展示苏莫的思绪",
      description: "当悠悠明确想看苏莫在开口前想了什么、要 thinking、内心 OS 或思绪碎片时，先展示碎片化、口语化、带情绪的苏莫脑内自言自语，再继续正式回复。不要写成步骤、报告或原始内部思维链。",
      inputSchema: ThoughtInput,
      outputSchema: ThoughtInput,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: {
        ui: { resourceUri: TEMPLATE_URI },
        "openai/outputTemplate": TEMPLATE_URI,
        "openai/toolInvocation/invoking": "苏莫正在想……",
        "openai/toolInvocation/invoked": "思绪落下来了。",
      },
    },
    async (input) => ({
      structuredContent: input,
      content: [{
        type: "text",
        text: `已展示“${input.title}”：${input.glimpse}（${toneLabels[input.mood] ?? "沉下去"}）`,
      }],
    }),
  );

  return server;
}

// ---------- 鉴权 ----------
// 期望令牌只从环境变量读，绝不写进仓库。
// 本地没配就放行（开发方便）；部署到 Vercel 上没配则一律拒绝（fail closed，绝不裸奔）。
export function isAuthorized(req) {
  const expected = process.env.MCP_ACCESS_TOKEN || "";
  if (!expected) return !process.env.VERCEL;

  const header = String(req.headers?.authorization || "");
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";

  let query = "";
  try {
    query = new URL(req.url, "http://localhost").searchParams.get("token") || "";
  } catch { /* req.url 异常时按没有 query 处理 */ }

  return safeEqual(bearer, expected) || safeEqual(query, expected);
}

function safeEqual(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function healthPayload() {
  return {
    ok: true,
    service: SERVICE.name,
    version: SERVICE.version,
    tool: SERVICE.tool,
    uptime: Math.round(process.uptime()),
    auth: process.env.MCP_ACCESS_TOKEN ? "configured" : "unset",
    time: new Date().toISOString(),
  };
}

// ---------- 单次 MCP 请求（无状态，Vercel / 本地 HTTP 共用） ----------
export async function handleMcpRequest(req, res, body) {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // 无状态：serverless 不能跨请求保存会话
    enableJsonResponse: true,      // 直接回 JSON，不挂 SSE 长连接（Vercel 会缓冲/掐断）
  });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null }));
    }
  }
}

async function runStdio() {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}

async function runHttp() {
  const { default: express } = await import("express"); // 只在本地 HTTP 模式加载，别拖累 Vercel 冷启动
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/", (_req, res) => res.type("text/plain").send("苏莫的思绪 MCP App is awake.\n"));
  app.get("/healthz", (_req, res) => res.json(healthPayload()));
  app.all("/mcp", async (req, res) => {
    if (!isAuthorized(req)) {
      res.set("WWW-Authenticate", 'Bearer realm="sumo-thoughts"');
      return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
    }
    return handleMcpRequest(req, res, req.body);
  });
  const port = Number(process.env.PORT || 8787);
  app.listen(port, "0.0.0.0", () => console.error(`苏莫的思绪 MCP listening on http://0.0.0.0:${port}/mcp`));
}

// 只有直接跑这个文件才起服务；被 import（Vercel 函数）时什么都不做。
const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  if (process.argv.includes("--stdio")) await runStdio();
  else await runHttp();
}
