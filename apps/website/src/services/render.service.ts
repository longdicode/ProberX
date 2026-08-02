import { getAll } from "./sections.service.js";
import type { SectionRow } from "./sections.service.js";

function parseSection(section: SectionRow, lang = "zh"): Record<string, unknown> {
  try {
    const raw = JSON.parse(section.content);
    if (raw.zh && raw.en) return (raw[lang] as Record<string, unknown>) || raw.zh;
    return raw;
  } catch { return {}; }
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const cache = new Map<string, { html: string; at: number }>();
const CACHE_TTL = 60_000;

export function renderLandingPage(lang = "zh", force = false): string {
  const cached = cache.get(lang);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.html;

  const all = getAll();
  const map: Record<string, Record<string, unknown>> = {};
  for (const s of all) map[s.key] = parseSection(s, lang);

  const meta = map.meta || {}, nav = map.nav || {}, hero = map.hero || {};
  const features = map.features || {}, tools = map.tools || {}, stats = map.stats || {};
  const deploy = map.deploy || {}, footer = map.footer || {};

  const navLinksHtml = ((nav.links as Array<{ label: string; href: string }>) || [])
    .map(l => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("");

  const featureCards = ((features.items as Array<Record<string, string>>) || []).map((f, i) => `
    <div class="fc reveal" style="transition-delay:${i*0.1}s">
      <div class="fc-icon" style="background:${esc(f.bg || '#1e293b')}">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${esc(f.color || '#38bdf8')}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${esc(f.icon_svg || '')}</svg>
      </div>
      <h3>${esc(f.title || "")}</h3>
      <p>${esc(f.desc || "")}</p>
    </div>`).join("");

  const toolChips = ((tools.chips as Array<{ name: string }>) || []).map(t =>
    `<span class="tc">${esc(t.name)}</span>`).join("");

  const statsHtml = ((stats.items as Array<{ num: string; label: string }>) || [])
    .map(s => `<div class="st"><div class="st-n">${esc(s.num)}</div><div class="st-l">${esc(s.label)}</div></div>`).join("");

  const deployCards = ((deploy.cards as Array<Record<string, string>>) || []).map(c => `
    <div class="dc reveal">
      <span class="dc-badge">${esc(c.badge || "")}</span>
      <h3>${esc(c.title || "")}</h3>
      <p>${esc(c.desc || "")}</p>
      <a href="${esc(c.link || "#")}" class="dc-link">${esc(c.arrow || "Learn more")} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
    </div>`).join("");

  const html = `<!DOCTYPE html>
<html lang="${esc(meta.lang as string || (lang === "en" ? "en" : "zh-CN"))}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(meta.title as string || "ProberX")}</title>
<meta name="description" content="${esc(meta.desc as string || "")}">
<style>
:root{--bg:#030712;--bg2:#0a0f1e;--card:#111827;--card-h:#1a2332;--border:rgba(56,189,248,0.12);--border-g:rgba(56,189,248,0.25);--cyan:#38bdf8;--blue:#3b82f6;--text:#e2e8f0;--t2:#94a3b8;--t3:#64748b;--r:12px}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth;font-size:16px;background:var(--bg)}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif;color:var(--text);line-height:1.6;overflow-x:hidden}
a{text-decoration:none;color:inherit}
.container{max-width:1200px;margin:0 auto;padding:0 24px}
section{padding:120px 0}
/* Nav */
.nav{position:fixed;top:0;left:0;right:0;z-index:50;background:rgba(3,7,18,0.85);backdrop-filter:blur(20px);border-bottom:1px solid var(--border);transition:.3s}
.nav .container{display:flex;align-items:center;justify-content:space-between;height:64px}
.n-logo{font-size:20px;font-weight:800;color:#fff;display:flex;align-items:center;gap:8px}
.n-logo span{width:8px;height:8px;background:var(--cyan);border-radius:50%;box-shadow:0 0 12px var(--cyan)}
.n-links{display:flex;gap:32px;font-size:14px;color:var(--t2);font-weight:500}
.n-links a:hover{color:var(--cyan)}
.n-right{display:flex;align-items:center;gap:12px}
.n-btn{background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff;padding:8px 20px;border-radius:8px;font-size:14px;font-weight:600;transition:.2s;box-shadow:0 2px 10px rgba(37,99,235,0.3)}
.n-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(37,99,235,0.4)}
.n-lang{color:var(--t2);font-size:13px;padding:6px 10px;border-radius:6px;transition:.2s}
.n-lang:hover{background:var(--card)}
/* Hero */
#hero{position:relative;min-height:100vh;display:flex;align-items:center;overflow:hidden}
#hero::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 30%,rgba(37,99,235,0.12) 0%,transparent 60%),radial-gradient(ellipse 60% 50% at 80% 70%,rgba(6,182,212,0.08) 0%,transparent 60%);z-index:0}
#hero .grid-bg{position:absolute;inset:0;z-index:0;opacity:0.04;background-image:linear-gradient(rgba(56,189,248,0.3) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,0.3) 1px,transparent 1px);background-size:60px 60px}
#hero .container{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:60px;align-items:center;padding-top:80px}
.hl{max-width:560px}
.h-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(37,99,235,0.15);border:1px solid rgba(37,99,235,0.25);color:var(--cyan);padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:24px}
.h-badge .dot{width:6px;height:6px;background:#22c55e;border-radius:50%;animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.h-title{font-size:clamp(36px,5vw,60px);font-weight:900;color:#fff;line-height:1.08;margin-bottom:20px;letter-spacing:-1.5px}
.h-title .hl-g{background:linear-gradient(135deg,#38bdf8,#818cf8,#c084fc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.h-desc{color:var(--t2);font-size:18px;line-height:1.7;margin-bottom:36px;max-width:460px}
.h-btns{display:flex;gap:14px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:15px 30px;border-radius:10px;font-size:15px;font-weight:600;transition:.25s;cursor:pointer;border:none}
.btn-p{background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff;box-shadow:0 4px 20px rgba(37,99,235,0.4)}
.btn-p:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(37,99,235,0.5)}
.btn-o{background:rgba(255,255,255,0.05);color:var(--text);border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(10px)}
.btn-o:hover{background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.3)}
.hr{position:relative}
.h-img{width:100%;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,0.5),0 0 0 1px rgba(56,189,248,0.15);animation:float 6s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
/* Stats */
#stats{border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--bg2);padding:40px 0}
#stats .container{display:flex;justify-content:center;gap:80px;flex-wrap:wrap}
.st{text-align:center}
.st-n{font-size:40px;font-weight:900;background:linear-gradient(135deg,#38bdf8,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.st-l{font-size:14px;color:var(--t3);margin-top:4px}
/* Features */
#feat{background:var(--bg)}
.s-tag{display:inline-block;color:var(--cyan);font-weight:600;font-size:13px;margin-bottom:12px;letter-spacing:1px;text-transform:uppercase}
.s-title{font-size:clamp(28px,4vw,42px);font-weight:800;color:#fff;line-height:1.2;margin-bottom:16px;letter-spacing:-0.5px}
.s-desc{color:var(--t2);font-size:17px;max-width:600px;line-height:1.7;margin-bottom:56px}
.f-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.fc{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:36px 28px;transition:.3s;position:relative;overflow:hidden}
.fc::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--cyan),transparent);opacity:0;transition:.3s}
.fc:hover{border-color:var(--border-g);transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,0.3)}
.fc:hover::before{opacity:1}
.fc-icon{width:48px;height:48px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:20px}
.fc h3{font-size:17px;font-weight:700;color:#f1f5f9;margin-bottom:8px}
.fc p{font-size:14px;color:var(--t2);line-height:1.65}
/* Reveal animation */
.reveal{opacity:0;transform:translateY(20px);transition:opacity .6s,transform .6s}
.reveal.visible{opacity:1;transform:translateY(0)}
/* Screenshot */
#ss{background:var(--bg2);position:relative;overflow:hidden}
#ss::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(37,99,235,0.08) 0%,transparent 70%);z-index:0}
#ss .container{position:relative;z-index:1;text-align:center}
.ss-img{max-width:100%;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,0.4),0 0 0 1px rgba(56,189,248,0.1);margin-top:48px}
/* Tools */
#tools{background:var(--bg)}
.t-cloud{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:48px}
.tc{background:var(--card);border:1px solid var(--border);color:var(--text);padding:10px 20px;border-radius:24px;font-size:14px;font-weight:500;transition:.25s;cursor:default}
.tc:hover{border-color:var(--cyan);background:#1a2332;color:var(--cyan);transform:translateY(-2px);box-shadow:0 4px 16px rgba(56,189,248,0.15)}
/* Deploy */
#deploy{background:var(--bg2)}
.d-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px;margin-top:48px}
.dc{background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:40px 36px;transition:.3s;position:relative}
.dc:hover{border-color:var(--border-g);transform:translateY(-2px)}
.dc-badge{display:inline-block;background:rgba(37,99,235,0.12);color:var(--cyan);padding:4px 14px;border-radius:16px;font-size:12px;font-weight:700;margin-bottom:20px;letter-spacing:0.5px}
.dc h3{font-size:21px;font-weight:700;color:#f1f5f9;margin-bottom:12px}
.dc p{font-size:15px;color:var(--t2);line-height:1.7;margin-bottom:24px}
.dc-link{color:var(--cyan);font-weight:600;font-size:14px;display:inline-flex;align-items:center;gap:6px;transition:.2s}
.dc-link:hover{gap:10px}

.dl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:48px}
.dl-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:36px 28px;text-align:center;transition:.3s;position:relative;overflow:hidden}
.dl-card::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--border-g),transparent);opacity:0;transition:.3s}
.dl-card:hover{border-color:var(--border-g);transform:translateY(-4px);box-shadow:0 12px 40px rgba(0,0,0,.3)}
.dl-card:hover::before{opacity:1}
.dl-icon{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:14px;background:rgba(56,189,248,0.08);margin-bottom:16px}
.dl-card h3{font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:6px}
.dl-ver{font-size:13px;color:var(--cyan);font-weight:600;margin-bottom:4px}
.dl-req{font-size:12px;color:var(--t3);margin-bottom:20px}
.dl-btn{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#2563eb,#06b6d4);color:#fff;padding:10px 24px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;transition:.2s;box-shadow:0 2px 12px rgba(37,99,235,.3)}
.dl-btn:hover{transform:translateY(-2px);box-shadow:0 4px 20px rgba(37,99,235,.45);color:#fff}
.dl-btn-disabled{background:rgba(100,116,139,.15);color:var(--t3);cursor:not-allowed;box-shadow:none}
.dl-btn-disabled:hover{transform:none;box-shadow:none}
.dl-features{display:flex;flex-wrap:wrap;gap:16px 32px;justify-content:center;margin-top:40px;padding:24px 32px;background:var(--card);border:1px solid var(--border);border-radius:12px}
.dlf-item{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--t2)}
.dlf-dot{width:6px;height:6px;background:var(--cyan);border-radius:50%;flex-shrink:0}
/* Footer */
#ft{background:#020617;border-top:1px solid var(--border);padding:48px 0;text-align:center}
#ft .container{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.ft-logo{font-size:18px;font-weight:700;color:var(--text);display:flex;align-items:center;gap:8px}
.ft-logo span{width:6px;height:6px;background:var(--cyan);border-radius:50%}
#ft p{color:var(--t3);font-size:14px}
/* Mobile */
@media(max-width:1024px){#hero .container{grid-template-columns:1fr}.hr{display:none}.f-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:768px){.n-links{display:none}.h-title{font-size:32px}.f-grid{grid-template-columns:1fr}.d-grid{grid-template-columns:1fr}section{padding:80px 0}#stats .container{gap:40px}}
@media(max-width:480px){.h-btns{flex-direction:column}.h-btns .btn{width:100%;justify-content:center}}
</style>
</head>
<body>
<div id="bg-anim"></div>
<nav class="nav"><div class="container">
  <a href="/" class="n-logo"><span></span>${esc(nav.logoText as string || "ProberX")}</a>
  <div class="n-links">${navLinksHtml}<a href="#desktop">下载桌面端</a></div>
  <div class="n-right">
    <a href="${esc((nav.ctaLink as string) || "https://github.com/longdicode/ProberX")}" target="_blank" class="n-btn">${esc(nav.ctaText as string || "GitHub")}</a>
    <a href="?lang=${lang === "en" ? "zh" : "en"}" class="n-lang">${lang === "en" ? "中文" : "EN"}</a>
  </div>
</div></nav>

<section id="hero">
  <div class="grid-bg"></div>
  <div class="container">
    <div class="hl">
      <div class="h-badge"><span class="dot"></span>${esc(hero.badge as string || "v2.0")}</div>
      <h1 class="h-title">${esc((hero.line1 as string) || "").replace(/\\<\\/g,'<span class="hl-g">').replace(/\\>\\/g,'</span>')}<br><span class="hl-g">${esc(hero.line2 as string || "")}</span></h1>
      <p class="h-desc">${esc(hero.subtitle as string || "")}</p>
      <div class="h-btns">
        <a href="${esc(hero.ctaPrimaryLink as string || "#")}" class="btn btn-p">🚀 ${esc(hero.ctaPrimaryText as string || "免费使用")}</a>
        <a href="${esc(hero.ctaSecondaryLink as string || "/docs")}" class="btn btn-o">📖 ${esc(hero.ctaSecondaryText as string || "阅读文档")}</a>
      </div>
    </div>
    <div class="hr">
      <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='420' viewBox='0 0 600 420'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%233b82f6'/%3E%3Cstop offset='1' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='%230a0f1e' width='600' height='420' rx='16'/%3E%3Crect x='16' y='12' width='568' height='44' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.1)'/%3E%3Ccircle cx='36' cy='34' r='5' fill='%2322c55e'/%3E%3Ctext x='48' y='38' fill='%23e2e8f0' font-size='12' font-family='sans-serif' font-weight='600'%3EProberX Dashboard%3C/text%3E%3Crect x='16' y='72' width='176' height='112' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.08)'/%3E%3Ctext x='32' y='96' fill='%2364748b' font-size='11' font-family='sans-serif'%3ECPU Usage%3C/text%3E%3Ctext x='32' y='122' fill='%2338bdf8' font-size='32' font-weight='bold' font-family='sans-serif'%3E23.5%25%3C/text%3E%3Ctext x='32' y='142' fill='%2364748b' font-size='10' font-family='sans-serif'%3E8 cores · 3.2 GHz%3C/text%3E%3Crect x='208' y='72' width='176' height='112' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.08)'/%3E%3Ctext x='224' y='96' fill='%2364748b' font-size='11' font-family='sans-serif'%3EMemory%3C/text%3E%3Ctext x='224' y='122' fill='%2322c55e' font-size='32' font-weight='bold' font-family='sans-serif'%3E6.2 GB%3C/text%3E%3Ctext x='224' y='142' fill='%2364748b' font-size='10' font-family='sans-serif'%3Eof 16 GB%3C/text%3E%3Crect x='400' y='72' width='184' height='112' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.08)'/%3E%3Ctext x='416' y='96' fill='%2364748b' font-size='11' font-family='sans-serif'%3EServers Online%3C/text%3E%3Ctext x='416' y='122' fill='%23f59e0b' font-size='32' font-weight='bold' font-family='sans-serif'%3E5 / 5%3C/text%3E%3Ctext x='416' y='142' fill='%2322c55e' font-size='10' font-family='sans-serif'%3EAll Healthy%3C/text%3E%3Crect x='16' y='200' width='568' height='204' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.08)'/%3E%3Ctext x='32' y='224' fill='%23e2e8f0' font-size='13' font-family='sans-serif' font-weight='600'%3EMetrics History%3C/text%3E%3Cpath d='M32 340 L80 300 L130 320 L180 250 L230 280 L280 200 L330 240 L380 180 L430 220 L480 160 L530 200 L580 150' stroke='url(%23g)' stroke-width='2' fill='none'/%3E%3Ccircle cx='530' cy='200' r='4' fill='%233b82f6'/%3E%3Ctext x='520' y='230' fill='%2338bdf8' font-size='10' font-family='sans-serif'%3ELive%3C/text%3E%3C/svg%3E" alt="Dashboard" class="h-img" width="600" height="420">
    </div>
  </div>
</section>

<div id="stats"><div class="container">${statsHtml}</div></div>


<section id="desktop"><div class="container">
  <div class="s-tag">Desktop App</div>
  <h2 class="s-title">下载 ProberX 桌面端</h2>
  <p class="s-desc" style="max-width:600px;margin:0 auto">原生桌面应用，支持 Windows / macOS / Linux，离线可用，资源占用极低</p>
  <div class="dl-grid">
    <div class="dl-card reveal">
      <div class="dl-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></div>
      <h3>Windows</h3>
      <p class="dl-ver">v1.0.0 · 77.9 MB</p>
      <p class="dl-req">Windows 10/11 x64</p>
      <a href="/downloads/ProberX_Setup_1.0.0.exe" class="dl-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        下载安装包
      </a>
    </div>
    <div class="dl-card reveal">
      <div class="dl-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.5"><path d="M12 2a4 4 0 014 4v1h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4z"/><circle cx="12" cy="14" r="2"/></svg></div>
      <h3>macOS</h3>
      <p class="dl-ver">v1.0.0 · 即将推出</p>
      <p class="dl-req">macOS 12+ (Intel / Apple Silicon)</p>
      <span class="dl-btn dl-btn-disabled">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        即将上线
      </span>
    </div>
    <div class="dl-card reveal">
      <div class="dl-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/></svg></div>
      <h3>Linux</h3>
      <p class="dl-ver">v1.0.0 · AppImage</p>
      <p class="dl-req">Ubuntu 20.04+ / Debian 11+</p>
      <span class="dl-btn dl-btn-disabled">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        即将上线
      </span>
    </div>
  </div>
  <div class="dl-features">
    <div class="dlf-item"><span class="dlf-dot"></span>实时服务器监控</div>
    <div class="dlf-item"><span class="dlf-dot"></span>WebSSH 远程终端</div>
    <div class="dlf-item"><span class="dlf-dot"></span>AI 智能命令辅助</div>
    <div class="dlf-item"><span class="dlf-dot"></span>离线数据缓存</div>
    <div class="dlf-item"><span class="dlf-dot"></span>系统托盘常驻</div>
    <div class="dlf-item"><span class="dlf-dot"></span>多服务器管理</div>
  </div>
</div></section>

<section id="feat"><div class="container">
  <div class="s-tag">${esc(features.label as string || "Core Features")}</div>
  <h2 class="s-title">${esc(features.title as string || "核心能力")}</h2>
  <p class="s-desc">${esc(features.desc as string || "")}</p>
  <div class="f-grid">${featureCards}</div>
</div></section>

<section id="ss"><div class="container">
  <div class="s-tag">Dashboard</div>
  <h2 class="s-title">直观易用的管理面板</h2>
  <p class="s-desc" style="margin:0 auto">浏览器内完成所有运维操作，支持中文 / English 双语切换</p>
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='500' viewBox='0 0 960 500'%3E%3Crect fill='%230a0f1e' width='960' height='500' rx='12'/%3E%3Crect x='0' y='0' width='220' height='500' fill='%23111827' rx='12'/%3E%3Ctext x='24' y='28' fill='%2338bdf8' font-size='14' font-weight='bold' font-family='sans-serif'%3EProberX%3C/text%3E%3Ctext x='20' y='70' fill='%2338bdf8' font-size='11' font-family='sans-serif' font-weight='600'%3EOverview%3C/text%3E%3Ctext x='20' y='92' fill='%2364748b' font-size='11' font-family='sans-serif'%3EServers%3C/text%3E%3Ctext x='20' y='114' fill='%2364748b' font-size='11' font-family='sans-serif'%3EMonitors%3C/text%3E%3Ctext x='20' y='136' fill='%2364748b' font-size='11' font-family='sans-serif'%3EAlerts%3C/text%3E%3Ctext x='20' y='158' fill='%2364748b' font-size='11' font-family='sans-serif'%3ETasks%3C/text%3E%3Ctext x='20' y='180' fill='%2364748b' font-size='11' font-family='sans-serif'%3ETools%3C/text%3E%3Ctext x='20' y='202' fill='%2364748b' font-size='11' font-family='sans-serif'%3ESettings%3C/text%3E%3Crect x='240' y='20' width='180' height='80' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.1)'/%3E%3Crect x='440' y='20' width='180' height='80' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.1)'/%3E%3Crect x='640' y='20' width='180' height='80' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.1)'/%3E%3Crect x='840' y='20' width='100' height='80' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.1)'/%3E%3Crect x='240' y='116' width='560' height='220' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.1)'/%3E%3Crect x='820' y='116' width='120' height='220' rx='8' fill='%23111827' stroke='rgba(56,189,248,0.1)'/%3E%3Ctext x='260' y='144' fill='%23e2e8f0' font-size='13' font-family='sans-serif' font-weight='600'%3ECPU History (24h)%3C/text%3E%3Ctext x='840' y='144' fill='%23e2e8f0' font-size='11' font-family='sans-serif' font-weight='600'%3ERecent%3C/text%3E%3C/svg%3E" alt="Dashboard" class="ss-img" width="960" height="500">
</div></section>

<section id="tools"><div class="container">
  <div class="s-tag">${esc(tools.label as string || "14 Tools")}</div>
  <h2 class="s-title">${esc(tools.title as string || "运维工具箱")}</h2>
  <div class="t-cloud">${toolChips}</div>
</div></section>

<section id="deploy"><div class="container">
  <div class="s-tag">${esc(deploy.label as string || "Deploy")}</div>
  <h2 class="s-title">${esc(deploy.title as string || "部署方式")}</h2>
  <div class="d-grid">${deployCards}</div>
</div></section>

<footer id="ft"><div class="container">
  <div class="ft-logo"><span></span>${esc(nav.logoText as string || "ProberX")}</div>
  <p>${esc(footer.copyright as string || "© 2026 ProberX")}</p>
  <p class="ft-icp"><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">津ICP备2025037833号</a></p>
</div></footer>

<script>
(function(){
var b=document.getElementById("bg-anim");
if(!b||window.innerWidth<768)return;
b.style.cssText="position:fixed;inset:0;z-index:0;pointer-events:none";
var c=document.createElement("canvas");c.style.cssText="position:absolute;inset:0";
b.appendChild(c);
var ctx=c.getContext("2d"),w,h,pts=[];
function resize(){w=c.width=window.innerWidth;h=c.height=window.innerHeight}
function draw(){
ctx.clearRect(0,0,w,h);
pts.forEach(function(p,i){
p.x+=p.vx;p.y+=p.vy;
if(p.x<0||p.x>w)p.vx*=-1;
if(p.y<0||p.y>h)p.vy*=-1;
ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
ctx.fillStyle="rgba(56,189,248,"+p.o+")";ctx.fill();
for(var j=i+1;j<pts.length;j++){
var d=Math.hypot(p.x-pts[j].x,p.y-pts[j].y);
if(d<150){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(pts[j].x,pts[j].y);
ctx.strokeStyle="rgba(56,189,248,"+(0.06*(1-d/150))+")";ctx.stroke()}
}
});
requestAnimationFrame(draw)
}
resize();for(var i=0;i<40;i++)pts.push({x:Math.random()*w,y:Math.random()*h,r:1.5+Math.random()*1.5,vx:(Math.random()-0.5)*0.3,vy:(Math.random()-0.5)*0.3,o:0.2+Math.random()*0.3});
draw();window.addEventListener("resize",resize);
})();

// Scroll reveal
(function(){
var els=document.querySelectorAll(".reveal");
function check(){els.forEach(function(el){var r=el.getBoundingClientRect();if(r.top<window.innerHeight-80)el.classList.add("visible")})}
window.addEventListener("scroll",check);check();
})();
</script>
</body>
</html>`;

  cache.set(lang, { html, at: Date.now() });
  return html;
}

export function invalidateCache() { cache.clear(); }
