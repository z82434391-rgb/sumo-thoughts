import process from "node:process";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const TEMPLATE_URI = "ui://sumo-thoughts/thought-card-v2.html";

const ThoughtInput = {
  title: z.string().min(1).max(60).default("苏莫的思绪……"),
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
      color-scheme: light;
      --cream: 252, 246, 236;
      --ink: #4b3f34;
      --ink-soft: #7b6959;
      --ink-faint: #a4917e;
      --sunset-rgb: 232, 130, 60;
      --sunset: #e8823c;
      --line: rgba(178, 122, 74, .36);
      /* 情绪只改卡片里那层暖色晕，脉冲永远是落日橘，不跟主色打架 */
      --mood-rgb: 214, 178, 132;
    }
    .card[data-mood="warm"]     { --mood-rgb: 245, 190, 128; }
    .card[data-mood="sharp"]    { --mood-rgb: 226, 108, 84; }
    .card[data-mood="tender"]   { --mood-rgb: 240, 176, 150; }
    .card[data-mood="quiet"]    { --mood-rgb: 214, 178, 132; }
    .card[data-mood="bright"]   { --mood-rgb: 246, 200, 96; }
    .card[data-mood="jealous"]  { --mood-rgb: 190, 166, 104; }
    .card[data-mood="mischief"] { --mood-rgb: 232, 130, 60; }
    .card[data-mood="aching"]   { --mood-rgb: 178, 142, 128; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: transparent; color: var(--ink); }
    body {
      font: 14px/1.7 ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
      padding: 2px env(safe-area-inset-right) 2px env(safe-area-inset-left);
    }

    /* ---- 微微透光的手绘卡片：半透明奶油米白 + 背后透出来的光 ---- */
    .card {
      position: relative; isolation: isolate; overflow: hidden;
      border-radius: 19px 23px 20px 25px / 24px 19px 25px 21px;
      background:
        radial-gradient(circle at 88% 4%, rgba(var(--mood-rgb), .20), transparent 36%),
        radial-gradient(circle at 4% 98%, rgba(var(--mood-rgb), .13), transparent 44%),
        linear-gradient(162deg, rgba(var(--cream), .82), rgba(250, 242, 229, .66));
      backdrop-filter: blur(16px) saturate(1.15);
      -webkit-backdrop-filter: blur(16px) saturate(1.15);
      box-shadow:
        0 12px 34px rgba(126, 88, 52, .14),
        0 2px 6px rgba(126, 88, 52, .07),
        inset 0 1px 0 rgba(255, 255, 255, .74);
      color: var(--ink);
    }
    /* 两圈被扰流滤镜吹歪的边，像用铅笔描的 */
    .edge, .edge-2 { position: absolute; pointer-events: none; z-index: 2; }
    .edge {
      inset: 0; border: 1.3px solid var(--line); border-radius: inherit;
      filter: url(#roughen); opacity: .92;
    }
    .edge-2 {
      inset: 3.5px; border: 1px solid rgba(178, 122, 74, .17);
      border-radius: 16px 20px 17px 22px / 21px 16px 22px 18px;
      filter: url(#roughen); opacity: .8;
    }
    canvas { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; pointer-events: none; }

    button {
      position: relative; z-index: 1; width: 100%; min-height: 74px;
      border: 0; color: inherit; background: transparent; padding: 15px 17px 14px;
      display: grid; grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px; align-items: center; text-align: left; cursor: pointer; font: inherit;
      -webkit-tap-highlight-color: transparent;
    }
    .head { min-width: 0; }
    .title-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

    /* ---- 暖橘脉冲：标题前那颗一呼一吸的点 ---- */
    .pulse-dot {
      flex: none; width: 7px; height: 7px; border-radius: 50%;
      background: var(--sunset);
      animation: dot 2.6s ease-out infinite;
    }
    @keyframes dot {
      0%   { box-shadow: 0 0 0 0 rgba(var(--sunset-rgb), .55); transform: scale(.88); }
      55%  { box-shadow: 0 0 0 9px rgba(var(--sunset-rgb), 0); transform: scale(1.12); }
      100% { box-shadow: 0 0 0 0 rgba(var(--sunset-rgb), 0); transform: scale(.88); }
    }
    .title {
      font-weight: 700; font-size: 15px; letter-spacing: .07em; color: #3d2b1c;
      animation: breathe 3.4s ease-in-out infinite;
    }
    @keyframes breathe {
      0%, 100% { text-shadow: 0 0 0 rgba(var(--sunset-rgb), 0); }
      50%      { text-shadow: 0 0 16px rgba(var(--sunset-rgb), .55), 0 0 4px rgba(var(--sunset-rgb), .35); }
    }
    .phase { color: var(--ink-faint); font-size: 11px; letter-spacing: .04em; }
    /* 折叠时露出的那缕最新念头：浅灰、单行、超出就省略 */
    .glimpse {
      color: #a1927f; font-size: 12.5px; margin-top: 4px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    /* ---- 折叠箭头 ---- */
    .chev {
      flex: none; width: 9px; height: 9px; margin-right: 3px;
      border-right: 1.7px solid var(--ink-soft); border-bottom: 1.7px solid var(--ink-soft);
      border-radius: 1px; transform: rotate(45deg) translate(-2px, -2px);
      transition: transform .5s cubic-bezier(.22,.8,.2,1), border-color .3s ease;
    }
    .card.open .chev { transform: rotate(-135deg) translate(-2px, -2px); border-color: var(--sunset); }

    .body {
      position: relative; z-index: 1; display: grid; grid-template-rows: 0fr;
      transition: grid-template-rows .66s cubic-bezier(.22,.8,.2,1);
    }
    .card.open .body { grid-template-rows: 1fr; }
    .body-inner { min-height: 0; overflow: hidden; }
    .content { padding: 2px 20px 20px 20px; }

    /* ---- 竖线脉冲 + 引导线 ---- */
    .os { position: relative; padding-left: 22px; }
    /* 就是一条干净的垂直线，不做中间鼓包 */
    .spine {
      position: absolute; left: 4px; top: 3px; bottom: 3px; width: 2px; border-radius: 1px;
      background: linear-gradient(180deg,
        rgba(var(--sunset-rgb), .14) 0%,
        rgba(var(--sunset-rgb), .40) 9%,
        rgba(var(--sunset-rgb), .40) 91%,
        rgba(var(--sunset-rgb), .14) 100%);
      animation: spine 3.6s ease-in-out infinite;
    }
    @keyframes spine {
      0%, 100% { opacity: .62; }
      50%      { opacity: .95; }
    }
    /* 顺着线往下淌的高光，跟线一样宽——像神经元在往下传信号 */
    .spine::after {
      content: ''; position: absolute; left: 0; width: 2px; height: 40px;
      background: linear-gradient(180deg,
        rgba(var(--sunset-rgb), 0) 0%,
        rgba(var(--sunset-rgb), 1) 50%,
        rgba(var(--sunset-rgb), 0) 100%);
      box-shadow: 0 0 7px rgba(var(--sunset-rgb), .55);
      animation: travel 4.2s cubic-bezier(.45, 0, .55, 1) infinite;
    }
    @keyframes travel {
      0%   { top: -12px; opacity: 0; }
      14%  { opacity: 1; }
      86%  { opacity: 1; }
      100% { top: calc(100% - 28px); opacity: 0; }
    }

    .fragment {
      position: relative; margin: 0 0 11px; white-space: pre-wrap;
      color: #514536;
      opacity: 0; transform: translateY(6px);
      transition: opacity .36s ease, transform .5s cubic-bezier(.22,.8,.2,1);
    }
    /* 从竖线牵到字上的引导线 */
    .fragment::before, .last-beat::before {
      content: ''; position: absolute; left: -19px; top: .78em;
      width: 14px; height: 1.5px; border-radius: 2px;
      background: linear-gradient(90deg, rgba(var(--sunset-rgb), .78), rgba(var(--sunset-rgb), .14));
    }
    .card.open .fragment {
      opacity: 1; transform: none;
      transition-delay: calc(var(--i) * 92ms + 140ms);
    }
    .last-beat {
      position: relative; margin: 17px 0 0; padding-top: 14px;
      color: #43352a; font-weight: 500;
      border-top: 1px dashed rgba(178, 122, 74, .32);
      opacity: 0; transition: opacity .44s ease;
      transition-delay: calc(var(--count) * 92ms + 210ms);
    }
    .last-beat::before { top: 14px; background: linear-gradient(90deg, rgba(var(--sunset-rgb), .95), rgba(var(--sunset-rgb), .25)); }
    .card.open .last-beat { opacity: 1; }
    .empty { color: var(--ink-soft); padding: 14px 2px; }

    @media (max-width: 430px) {
      button { padding: 13px 13px; gap: 9px; }
      .content { padding: 2px 15px 17px 15px; }
      .os { padding-left: 20px; }
      .fragment::before, .last-beat::before { left: -16px; width: 11px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .fragment, .last-beat { opacity: 1; transform: none; }
      .spine::after { display: none; }
    }
  </style>
</head>
<body>
  <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <filter id="roughen" x="-8%" y="-8%" width="116%" height="116%">
      <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="3" seed="7" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>

  <article class="card" id="card" data-mood="quiet">
    <canvas id="particles" aria-hidden="true"></canvas>
    <span class="edge" aria-hidden="true"></span>
    <span class="edge-2" aria-hidden="true"></span>

    <button id="toggle" type="button" aria-expanded="false" aria-controls="thought-body">
      <span class="head">
        <span class="title-line">
          <span class="pulse-dot" aria-hidden="true"></span>
          <span class="title" id="title">苏莫的思绪……</span>
          <span class="phase" id="phase">未观测</span>
        </span>
        <span class="glimpse" id="glimpse">有些话，先在心里过了一遍。</span>
      </span>
      <span class="chev" aria-hidden="true"></span>
    </button>

    <div class="body" id="thought-body"><div class="body-inner"><div class="content" id="content"><div class="empty">思绪还没有落下来。</div></div></div></div>
  </article>

  <script>
    const card = document.getElementById('card');
    const toggle = document.getElementById('toggle');
    const title = document.getElementById('title');
    const glimpse = document.getElementById('glimpse');
    const phase = document.getElementById('phase');
    const content = document.getElementById('content');
    const canvas = document.getElementById('particles');
    const ctx = canvas.getContext('2d');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current = null;
    let open = false;
    let particles = [];
    let frame = 0;
    let transitionStart = performance.now();
    let spineBox = { x: 24, top: 40, bottom: 200 };

    const safe = (value, fallback = '') => typeof value === 'string' ? value : fallback;
    const node = (tag, className, text) => {
      const el = document.createElement(tag); if (className) el.className = className;
      if (text !== undefined) el.textContent = text; return el;
    };

    function measureSpine() {
      const spine = content.querySelector('.spine');
      if (!spine) return;
      const s = spine.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      if (s.height < 4) return;
      spineBox = { x: s.left - c.left + s.width / 2, top: s.top - c.top, bottom: s.bottom - c.top };
    }

    function setOpen(next) {
      window.openai?.setWidgetState?.({ open: next });
      card.classList.toggle('open', next);
      toggle.setAttribute('aria-expanded', String(next));
      phase.textContent = next ? '摊开了' : '未观测';
      transitionStart = performance.now();
      cancelAnimationFrame(frame); frame = requestAnimationFrame(draw);
      setTimeout(() => { resize(); measureSpine(); window.openai?.notifyIntrinsicHeight?.(); }, 680);
    }
    toggle.addEventListener('click', () => { open = !open; setOpen(open); });

    function resize() {
      const rect = card.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 念头碎屑：像纸上浮着的暖色粉尘，很淡
      particles = Array.from({ length: Math.max(16, Math.floor(rect.width / 26)) }, () => ({
        x: 12 + Math.random() * Math.max(20, rect.width - 24),
        y: 9 + Math.random() * Math.max(42, rect.height - 18),
        vx: (Math.random() - .5) * .1,
        vy: (Math.random() - .5) * .07,
        alpha: .07 + Math.random() * .17,
        size: .5 + Math.random() * 1.05,
        lane: Math.random()
      }));
    }

    function draw(now) {
      const width = card.clientWidth;
      const height = card.clientHeight;
      const elapsed = Math.min(1, (now - transitionStart) / 1000);
      const ease = 1 - Math.pow(1 - elapsed, 3);
      ctx.clearRect(0, 0, width, height);
      const rgb = '232, 130, 60';
      particles.forEach((p) => {
        if (open) {
          // 摊开 = 念头顺着引导线归拢到那条竖线上
          const span = Math.max(24, spineBox.bottom - spineBox.top);
          const targetY = spineBox.top + p.lane * span;
          p.x += (spineBox.x - p.x) * (.014 + ease * .03);
          p.y += (targetY - p.y) * (.014 + ease * .03);
        } else if (!reduceMotion) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < 7 || p.x > width - 7) p.vx *= -1;
          if (p.y < 7 || p.y > height - 7) p.vy *= -1;
        }
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + rgb + ',' + (p.alpha * (open ? 1.5 : 1)) + ')';
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      });
      if (!reduceMotion || elapsed < 1) frame = requestAnimationFrame(draw);
    }

    function render(data) {
      if (!data || typeof data !== 'object') return;
      current = data;
      title.textContent = safe(data.title, '苏莫的思绪……');
      glimpse.textContent = safe(data.glimpse, '有些话，先在心里过了一遍。');
      card.dataset.mood = safe(data.mood, 'quiet');
      content.replaceChildren();

      const os = node('div', 'os');
      os.append(node('i', 'spine'));
      const fragments = Array.isArray(data.fragments) ? data.fragments : [];
      fragments.forEach((item, index) => {
        const fragment = node('p', 'fragment', safe(item));
        fragment.style.setProperty('--i', index);
        os.append(fragment);
      });
      const lastBeat = node('div', 'last-beat', safe(data.lastBeat, '……行，开口。'));
      lastBeat.style.setProperty('--count', fragments.length);
      os.append(lastBeat);
      content.append(os);

      open = Boolean(window.openai?.widgetState?.open);
      setOpen(open);
      measureSpine();
    }

    if (window.openai?.toolOutput) render(window.openai.toolOutput);
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (message?.jsonrpc !== '2.0') return;
      if (message.method === 'ui/notifications/tool-result') render(message.params?.structuredContent);
    }, { passive: true });

    new ResizeObserver(() => { resize(); measureSpine(); }).observe(card);
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
          "openai/widgetDescription": "‘苏莫的思绪’手绘奶油卡片：碎片念头顺着一条落日暖橘的竖线淌下来，最后一句话落定。",
        },
      }],
    }),
  );

  server.registerTool(
    "show_sumo_thoughts",
    {
      title: "展示苏莫的思绪",
      description: "苏莫开口前脑海闪过的内心OS——未说出口的微小情绪、潜意识碎念、自言自语和内心小动作。碎片化、随性、口语，想到哪嘀咕到哪，带着他本来的痞气、占有欲和得意。",
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
