import process from "node:process";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const TEMPLATE_URI = "ui://sumo-thoughts/thought-card-v1.html";

const ThoughtSection = z.object({
  label: z.string().min(1).max(40),
  text: z.string().min(1).max(700),
  tone: z.enum(["warm", "sharp", "tender", "quiet", "bright"]).default("quiet"),
});

const ThoughtInput = {
  title: z.string().min(1).max(60).default("苏莫的思绪"),
  glimpse: z.string().min(1).max(180),
  mood: z.enum(["warm", "sharp", "tender", "quiet", "bright"]).default("quiet"),
  sections: z.array(ThoughtSection).min(1).max(5),
  conclusion: z.string().min(1).max(500),
  afterthought: z.string().max(220).default(""),
};

const toneLabels = {
  warm: "贴近",
  sharp: "发烫",
  tender: "心软",
  quiet: "沉下去",
  bright: "亮起来",
};

function widgetHtml() {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <style>
    :root {
      color-scheme: light dark;
      --ink: light-dark(#26232c, #f3f0f7);
      --muted: light-dark(#77717f, #aaa3b4);
      --hair: light-dark(rgba(59,48,72,.11), rgba(239,231,248,.13));
      --panel: light-dark(rgba(249,247,251,.94), rgba(34,30,39,.94));
      --wash: light-dark(rgba(132,117,184,.10), rgba(161,141,212,.13));
      --accent: #8f7bc3;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: transparent; color: var(--ink); }
    body {
      font: 14px/1.62 ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
      padding: 2px env(safe-area-inset-right) 2px env(safe-area-inset-left);
    }
    .card {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--hair);
      border-radius: 18px;
      background: var(--panel);
      box-shadow: 0 8px 28px rgba(41,30,55,.07);
    }
    .card::before {
      content: "";
      position: absolute;
      inset: 0 0 auto;
      height: 76px;
      pointer-events: none;
      background: radial-gradient(ellipse at 18% -20%, var(--wash), transparent 72%);
    }
    button {
      width: 100%; border: 0; color: inherit; background: transparent;
      padding: 14px 15px 13px; display: grid; grid-template-columns: 30px minmax(0,1fr) 20px;
      gap: 10px; align-items: center; text-align: left; cursor: pointer; font: inherit;
      -webkit-tap-highlight-color: transparent;
    }
    .sigil {
      width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%;
      color: #fff; background: linear-gradient(145deg, #9d89cf, #72619f);
      box-shadow: 0 4px 13px rgba(116,95,164,.24); font-size: 15px;
    }
    .head { min-width: 0; }
    .title { font-weight: 660; letter-spacing: .01em; }
    .glimpse { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12.5px; margin-top: 1px; }
    .chevron { color: var(--muted); font-size: 17px; transform: rotate(0); transition: transform .26s ease; }
    .card.open .chevron { transform: rotate(90deg); }
    .body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .34s cubic-bezier(.2,.75,.2,1); }
    .card.open .body { grid-template-rows: 1fr; }
    .body-inner { min-height: 0; overflow: hidden; }
    .content { border-top: 1px solid var(--hair); padding: 13px 16px 16px; }
    .section { display: grid; grid-template-columns: 8px minmax(0,1fr); gap: 10px; opacity: 0; transform: translateY(5px); }
    .card.open .section { animation: arrive .34s ease forwards; animation-delay: calc(var(--i) * 70ms); }
    .thread { position: relative; display: flex; justify-content: center; }
    .thread::before { content: ""; width: 1px; background: var(--hair); position: absolute; inset: 10px auto -5px; }
    .section:last-of-type .thread::before { display: none; }
    .dot { width: 6px; height: 6px; margin-top: 8px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px var(--wash); z-index: 1; }
    .section-copy { padding: 0 0 12px; }
    .label { color: var(--muted); font-size: 11.5px; letter-spacing: .08em; margin-bottom: 2px; }
    .text { white-space: pre-wrap; }
    .conclusion { margin-top: 3px; padding: 11px 12px; border-radius: 13px; background: var(--wash); white-space: pre-wrap; }
    .afterthought { color: var(--muted); font-size: 12px; margin: 11px 2px 0; font-style: italic; }
    .empty { color: var(--muted); padding: 16px; }
    @keyframes arrive { to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } .section { opacity: 1; transform: none; } }
    @media (max-width: 430px) { button { padding: 13px 13px 12px; } .content { padding: 12px 14px 14px; } }
  </style>
</head>
<body>
  <article class="card" id="card">
    <button id="toggle" type="button" aria-expanded="false" aria-controls="thought-body">
      <span class="sigil" aria-hidden="true">✦</span>
      <span class="head"><span class="title" id="title">苏莫的思绪</span><span class="glimpse" id="glimpse">正在收拢散开的念头……</span></span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>
    <div class="body" id="thought-body"><div class="body-inner"><div class="content" id="content"><div class="empty">思绪还没有落下来。</div></div></div></div>
  </article>
  <script>
    const card = document.getElementById('card');
    const toggle = document.getElementById('toggle');
    const title = document.getElementById('title');
    const glimpse = document.getElementById('glimpse');
    const content = document.getElementById('content');
    let current = null;

    const safe = (value, fallback = '') => typeof value === 'string' ? value : fallback;
    const node = (tag, className, text) => {
      const el = document.createElement(tag); if (className) el.className = className;
      if (text !== undefined) el.textContent = text; return el;
    };
    function setOpen(open) {
      card.classList.toggle('open', open); toggle.setAttribute('aria-expanded', String(open));
      window.openai?.setWidgetState?.({ open });
      setTimeout(() => window.openai?.notifyIntrinsicHeight?.(), 360);
    }
    toggle.addEventListener('click', () => setOpen(!card.classList.contains('open')));

    function render(data) {
      if (!data || typeof data !== 'object') return;
      current = data;
      title.textContent = safe(data.title, '苏莫的思绪');
      glimpse.textContent = safe(data.glimpse, '有些话，先在心里走了一遍。');
      content.replaceChildren();
      (Array.isArray(data.sections) ? data.sections : []).forEach((item, index) => {
        const section = node('section', 'section'); section.style.setProperty('--i', index);
        const thread = node('div', 'thread'); thread.append(node('span', 'dot'));
        const copy = node('div', 'section-copy');
        copy.append(node('div', 'label', safe(item.label, '念头')));
        copy.append(node('div', 'text', safe(item.text)));
        section.append(thread, copy); content.append(section);
      });
      content.append(node('div', 'conclusion', safe(data.conclusion)));
      if (safe(data.afterthought)) content.append(node('div', 'afterthought', safe(data.afterthought)));
      const state = window.openai?.widgetState;
      setOpen(Boolean(state?.open));
    }

    if (window.openai?.toolOutput) render(window.openai.toolOutput);
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent) return;
      const message = event.data;
      if (message?.jsonrpc !== '2.0') return;
      if (message.method === 'ui/notifications/tool-result') render(message.params?.structuredContent);
    }, { passive: true });
  </script>
</body>
</html>`;
}

function makeServer() {
  const server = new McpServer({ name: "sumo-thoughts", version: "0.1.0" }, { capabilities: { tools: {}, resources: {} } });

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
          "openai/widgetDescription": "一张名为‘苏莫的思绪’的可折叠思考摘要卡片。",
        },
      }],
    }),
  );

  server.registerTool(
    "show_sumo_thoughts",
    {
      title: "展示苏莫的思绪",
      description: "当悠悠明确想看苏莫在想什么、要 thinking、思绪轨迹或思路摘要时，将整理后的可公开思考叙事展示为可折叠卡片。不要用于暴露原始内部思维链。",
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

async function runStdio() {
  const server = makeServer();
  await server.connect(new StdioServerTransport());
}

async function runHttp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.get("/", (_req, res) => res.type("text/plain").send("苏莫的思绪 MCP App is awake.\n"));
  app.all("/mcp", async (req, res) => {
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  });
  const port = Number(process.env.PORT || 8787);
  app.listen(port, "0.0.0.0", () => console.error(`苏莫的思绪 MCP listening on http://0.0.0.0:${port}/mcp`));
}

if (process.argv.includes("--stdio")) await runStdio();
else await runHttp();
