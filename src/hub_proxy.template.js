const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const META_PATH = path.join(__dirname, '.agy_zh_meta.json');
const zhMainPath = path.join(__dirname, 'hub_main_zh.js');
const liveHubMainPath = path.join(__dirname, 'hub_main.js');

function readMeta() {
  if (!fs.existsSync(META_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8')) || {};
  } catch (_e) {
    return {};
  }
}

function writeMetaPatch(patch) {
  try {
    const next = {
      ...readMeta(),
      ...patch,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(META_PATH, JSON.stringify(next, null, 2), 'utf8');
    return next;
  } catch (_e) {
    return null;
  }
}

function resolveLogDir() {
  const envDir = (process.env.AGY_ZH_LOG_DIR || '').trim();
  if (envDir) return envDir;
  const meta = readMeta();
  if (meta && meta.logDir) return meta.logDir;
  return path.join(os.homedir(), '.antigravity-zh-cn', 'logs');
}

const resolvedLogDir = resolveLogDir();
try {
  if (!fs.existsSync(resolvedLogDir)) fs.mkdirSync(resolvedLogDir, { recursive: true });
} catch (_e) {}

const logFile = (process.env.AGY_ZH_DEBUG_LOG || '').trim() || path.join(resolvedLogDir, 'hub_debug.log');
const autoPatchLogFile = (process.env.AGY_ZH_PATCH_LOG || '').trim() || path.join(resolvedLogDir, 'antigravity_auto_patch.log');

let titleTranslator = null;
try {
  titleTranslator = require('./title_translator.js');
} catch (e) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] [Proxy ERROR] Failed to load title_translator.js: ${e.message}\n`);
  } catch (_e) {}
}

let thoughtTranslator = null;
try {
  thoughtTranslator = require('./thought_translator.js');
} catch (e) {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] [Proxy ERROR] Failed to load thought_translator.js: ${e.message}\n`);
  } catch (_e) {}
}

/**
 * 代理运行日志按启动次数留存裁剪（严格保留最近 2 次运行会话）
 * - 代理每次启动写入首行前调用 keepExistingRuns = 1，写入本次后文件内仅留最近 2 次运行日志
 */
function pruneProxyLogKeepLastRuns(targetLogFile, keepExistingRuns = 1, maxBytes = 1024 * 1024) {
  if (!targetLogFile || !fs.existsSync(targetLogFile)) {
    return { purgedRuns: 0, keptRuns: 0, trimmed: false };
  }
  try {
    const raw = fs.readFileSync(targetLogFile, 'utf8');
    if (!raw.trim()) return { purgedRuns: 0, keptRuns: 0, trimmed: false };

    const sessionRe = /^\[[^\]]+\] \[Proxy\] initProxy starting/gm;
    const starts = [];
    let match;
    while ((match = sessionRe.exec(raw)) !== null) {
      starts.push(match.index);
    }

    let keptContent = '';
    let purgedRuns = 0;
    let keptRuns = 0;

    if (starts.length > 0) {
      const blocks = [];
      for (let i = 0; i < starts.length; i++) {
        const end = i + 1 < starts.length ? starts[i + 1] : raw.length;
        const blk = raw.slice(starts[i], end).trim();
        if (blk) blocks.push(blk);
      }
      const maxKeep = Math.max(0, keepExistingRuns);
      if (blocks.length > maxKeep) {
        purgedRuns = blocks.length - maxKeep;
      }
      const keptBlocks = maxKeep > 0 ? blocks.slice(-maxKeep) : [];
      keptRuns = keptBlocks.length;
      keptContent = keptBlocks.join('\n');
    } else if (keepExistingRuns > 0) {
      keptContent = raw.trim().split(/\r?\n/).slice(-100).join('\n');
      keptRuns = keptContent ? 1 : 0;
    }

    let trimmed = false;
    if (keptContent && Buffer.byteLength(keptContent, 'utf8') > maxBytes) {
      keptContent = keptContent.split(/\r?\n/).slice(-1500).join('\n');
      trimmed = true;
    }

    fs.writeFileSync(targetLogFile, keptContent ? keptContent.trim() + '\n' : '', 'utf8');
    return { purgedRuns, keptRuns, trimmed };
  } catch (e) {
    return { purgedRuns: 0, keptRuns: 0, trimmed: false, error: e.message };
  }
}

function log(msg) {
  try {
    if (fs.existsSync(logFile)) {
      const stat = fs.statSync(logFile);
      if (stat.size > 2 * 1024 * 1024) {
        const tail = fs.readFileSync(logFile, 'utf8').split('\n').slice(-1500).join('\n');
        fs.writeFileSync(logFile, tail + '\n', 'utf8');
      }
    }
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
}

function logAutoPatch(msg) {
  try {
    if (!fs.existsSync(path.dirname(autoPatchLogFile))) return;
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ` +
      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    fs.appendFileSync(autoPatchLogFile, `[${ts}] ${msg}\n`, 'utf8');
  } catch (e) {}
}

/**
 * 实时读取当前安装的 Antigravity IDE 版本（ideVersion + agyVersion）
 */
function readCurrentInstalledVersions() {
  let ideVersion = '';
  let agyVersion = '';
  try {
    const prodPath = path.resolve(__dirname, '..', '..', 'product.json');
    if (fs.existsSync(prodPath)) {
      const prod = JSON.parse(fs.readFileSync(prodPath, 'utf8'));
      ideVersion = prod.ideVersion || prod.antigravityVersion || '';
    }
  } catch (_e) {}
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      agyVersion = pkg.version || '';
    }
  } catch (_e) {}
  return { ideVersion, agyVersion };
}

/**
 * 解析可用的独立 Node.js 可执行文件（绝不能误用 Electron 本体 Antigravity IDE.exe）
 */
function resolveNodeExecutable(meta) {
  const candidates = [];
  if (meta && meta.nodeExecPath) candidates.push(meta.nodeExecPath);
  if (process.env.NODE_EXE) candidates.push(process.env.NODE_EXE);
  if (/^node(\.exe)?$/i.test(path.basename(process.execPath || ''))) {
    candidates.push(process.execPath);
  }
  const pathEnv = process.env.PATH || '';
  for (const dir of pathEnv.split(path.delimiter)) {
    const trimmed = dir.trim();
    if (!trimmed) continue;
    candidates.push(path.join(trimmed, process.platform === 'win32' ? 'node.exe' : 'node'));
  }
  for (const cand of candidates) {
    if (cand && /^node(\.exe)?$/i.test(path.basename(cand)) && fs.existsSync(cand)) {
      return cand;
    }
  }
  return '';
}

/**
 * 从当前运行的官方 Hub 后端拉取真实原版 /main.js（用于升级后热捕获对比与重编）
 */
function fetchUpstreamMainJs(port, reqUrl, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: reqUrl || '/main.js',
        method: 'GET',
        headers: {
          'Accept-Encoding': 'identity',
          'Cache-Control': 'no-cache'
        },
        timeout: timeoutMs
      },
      res => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Upstream /main.js HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Upstream /main.js fetch timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

const PREFERRED_PROXY_PORT = 14588;
let proxyPort = PREFERRED_PROXY_PORT;
let targetPort = 0;
let proxyServer = null;

// 升级后热捕获与单飞重编状态（同一运行会话仅核验一次，日常启动 0ms 额外开销）
let syncedVersionSignature = '';
let syncInFlightPromise = null;
let fallbackUpstreamSha = '';

/**
 * 升级后 /main.js 真身自动热捕获与无缝同步重编译：
 * - 日常版本未变化时直接返回 { mode: 'zh' }（0ms 额外开销）；
 * - 检测到 IDE 升级（ideVersion/agyVersion 与上次已捕获版本不一致）时，
 *   首次向本地官方后端 127.0.0.1:targetPort 拉取真实原版 /main.js：
 *     1) 若 SHA-256 与现有构建源一致 -> 标记本版本已核验，立即返回 zh；
 *     2) 若官方确实发布了新版 /main.js -> 落盘最新原件并用独立 Node.js 热重编；
 *        - 重编成功 -> 当次请求直接下发新版 hub_main_zh.js（零重启同步生效）！
 *        - 重编失败 -> 绝不拿旧版 hub_main_zh.js 强塞给新版后端，无缝降级返回官方原版防白屏！
 */
async function ensureLiveMainSyncedAndCompiled(reqUrl) {
  const curVers = readCurrentInstalledVersions();
  const verSig = `${curVers.ideVersion || 'unknown'}::${curVers.agyVersion || 'unknown'}`;
  const meta = readMeta();
  const zhExists = fs.existsSync(zhMainPath);

  if (fallbackUpstreamSha && syncedVersionSignature === verSig) {
    return { mode: 'upstream-passthrough' };
  }

  const metaAlreadySynced =
    zhExists &&
    (!curVers.agyVersion || meta.capturedHubAgyVersion === curVers.agyVersion) &&
    (!curVers.ideVersion || meta.capturedHubIdeVersion === curVers.ideVersion);

  if ((syncedVersionSignature === verSig && zhExists) || metaAlreadySynced) {
    syncedVersionSignature = verSig;
    return { mode: 'zh' };
  }

  if (!targetPort) {
    return zhExists ? { mode: 'zh' } : { mode: 'upstream-passthrough' };
  }

  if (syncInFlightPromise) {
    return syncInFlightPromise;
  }

  syncInFlightPromise = (async () => {
    try {
      const t0 = Date.now();
      log(`[LiveSync] 检测到新版本 (${verSig}) 首次加载 /main.js，开始向官方后端 127.0.0.1:${targetPort} 核验真身...`);
      const upstreamBuf = await fetchUpstreamMainJs(targetPort, reqUrl, 4500);
      if (!upstreamBuf || upstreamBuf.length < 500 * 1024) {
        log(`[LiveSync] 上游 /main.js 体积异常 (${upstreamBuf ? upstreamBuf.length : 0} B)，保守回退现有模式`);
        return zhExists ? { mode: 'zh' } : { mode: 'upstream-passthrough' };
      }

      const upstreamSha = crypto.createHash('sha256').update(upstreamBuf).digest('hex');
      const curMeta = readMeta();

      // 情况 A：官方本次升级未改动 /main.js（最常见，仅更新了扩展胶水代码）
      if (zhExists && curMeta.hubSourceSha256 && curMeta.hubSourceSha256 === upstreamSha) {
        writeMetaPatch({
          capturedHubIdeVersion: curVers.ideVersion,
          capturedHubAgyVersion: curVers.agyVersion,
          capturedHubSha256: upstreamSha
        });
        syncedVersionSignature = verSig;
        fallbackUpstreamSha = '';
        log(`[LiveSync] ✔ 新版本 (${verSig}) 官方 /main.js 与已编译源 100% 一致 (${Date.now() - t0}ms)，直接启用全量汉化！`);
        return { mode: 'zh' };
      }

      // 情况 B：官方确实发布了新版 /main.js -> 落盘最新真身并即时热编译
      log(`[LiveSync] 检测到官方发布了新版 /main.js (${upstreamBuf.length} B, sha=${upstreamSha.slice(0, 12)})，开始热捕获与同步重编...`);
      fs.writeFileSync(liveHubMainPath, upstreamBuf);
      const patchDir = curMeta.patchSrcDir ? path.resolve(curMeta.patchSrcDir, '..') : '';
      if (patchDir && fs.existsSync(patchDir)) {
        try {
          fs.writeFileSync(path.join(patchDir, 'hub_main.js'), upstreamBuf);
        } catch (_e) {}
      }

      const buildScript = patchDir ? path.join(patchDir, 'build_ultimate_chinese_engine.js') : '';
      const nodeExe = resolveNodeExecutable(curMeta);

      if (!buildScript || !fs.existsSync(buildScript) || !nodeExe) {
        const why = !nodeExe ? '未找到独立 Node.js 可执行文件' : `未找到构建脚本 ${buildScript}`;
        log(`[LiveSync WARN] 无法热重编新版 /main.js (${why})，为防新旧协议错配，本次透传官方原版！`);
        logAutoPatch(`[热同步降级] 版本 ${verSig} 官方 /main.js 已更新但${why}，已安全透传官方原版防白屏。`);
        fallbackUpstreamSha = upstreamSha;
        syncedVersionSignature = verSig;
        return { mode: 'upstream', buffer: upstreamBuf };
      }

      try {
        execFileSync(nodeExe, [buildScript], {
          cwd: patchDir,
          timeout: 25000,
          stdio: 'pipe',
          windowsHide: true
        });
        const reportPath = path.join(__dirname, '.agy_build_report.json');
        let buildReport = null;
        if (fs.existsSync(reportPath)) {
          try {
            buildReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
          } catch (_e) {}
        }
        writeMetaPatch({
          ideVersion: curVers.ideVersion || curMeta.ideVersion || '',
          agyVersion: curVers.agyVersion || curMeta.agyVersion || '',
          hubSourceSha256: upstreamSha,
          capturedHubIdeVersion: curVers.ideVersion,
          capturedHubAgyVersion: curVers.agyVersion,
          capturedHubSha256: upstreamSha,
          moduleStatus: buildReport ? buildReport.modules : curMeta.moduleStatus,
          skippedModules: buildReport ? buildReport.skippedModules : []
        });
        syncedVersionSignature = verSig;
        fallbackUpstreamSha = '';
        const skippedCount = buildReport && Array.isArray(buildReport.skippedModules) ? buildReport.skippedModules.length : 0;
        const msg = `[热同步成功] 已基于新版 ${verSig} 官方 /main.js 实时重编并生效 (${Date.now() - t0}ms${skippedCount > 0 ? `，降级跳过 ${skippedCount} 个可选模块` : '，全模块 100% 兼容'})`;
        log(`[LiveSync] ✔ ${msg}`);
        logAutoPatch(msg);
        return { mode: 'zh' };
      } catch (buildErr) {
        log(`[LiveSync ERROR] 基于新版 ${verSig} /main.js 热重编失败: ${buildErr.message}，无缝降级返回官方原版防白屏`);
        logAutoPatch(`[热同步熔断] 新版 ${verSig} 官方 /main.js 核心结构不兼容 (${buildErr.message})，已安全透传官方原版防白屏。`);
        fallbackUpstreamSha = upstreamSha;
        syncedVersionSignature = verSig;
        return { mode: 'upstream', buffer: upstreamBuf };
      }
    } catch (err) {
      log(`[LiveSync WARN] 热核验异常 (${err.message})，回退使用现有资产`);
      return zhExists ? { mode: 'zh' } : { mode: 'upstream-passthrough' };
    } finally {
      syncInFlightPromise = null;
    }
  })();

  return syncInFlightPromise;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body, 'utf8'),
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 512 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function handleTranslateThoughtRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    return;
  }

  try {
    if (!thoughtTranslator) {
      sendJson(res, 200, { ok: false, results: [], error: 'thought_translator unavailable' });
      return;
    }
    const body = await readJsonBody(req);
    const items = Array.isArray(body?.items) ? body.items : [];
    const result = await thoughtTranslator.translateThoughtBatch(items);
    const st = result.stats || {};
    log(`[Translate Thought] total=${st.total} cache=${st.cacheHits} static=${st.staticHits} translated=${st.translatedCount} cost=${st.costMs}ms`);
    sendJson(res, 200, result);
  } catch (err) {
    log(`[Translate Thought ERROR] ${err.message}`);
    sendJson(res, 400, { ok: false, results: [], error: err.message });
  }
}

async function handleTranslateTitleRequest(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const reqStart = Date.now();
  try {
    const u = new URL('http://127.0.0.1' + url);
    const text = u.searchParams.get('text') || '';
    const cascadeId = u.searchParams.get('id') || '';

    if (!titleTranslator) {
      log(`[Translate ERROR] titleTranslator not loaded for id=${cascadeId}`);
      sendJson(res, 200, { ok: false, translated: text, source: 'unavailable', persistable: false });
      return;
    }

    const result = await titleTranslator.translateTitle(text, { cascadeId });
    const cost = Date.now() - reqStart;
    log(`[Translate Title] id=${cascadeId || '-'} source=${result.source} persistable=${result.persistable} cost=${cost}ms "${text}" -> "${result.translated}"`);
    sendJson(res, 200, result);
  } catch (err) {
    log(`[Translate ERROR] url=${url} err=${err.message}`);
    sendJson(res, 500, { ok: false, error: err.message, persistable: false });
  }
}

function forwardToUpstream(req, res, url) {
  if (!targetPort) {
    log('[Proxy ERROR] targetPort not resolved yet for url: ' + url);
    res.writeHead(502);
    res.end('HubProxy: Target port not resolved yet');
    return;
  }

  const options = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: req.headers
  };

  const proxyReq = http.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    log(`[Proxy Forward Error] url=${url} err=${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end('HubProxy Error: ' + err.message);
    }
  });

  req.pipe(proxyReq);
}

function initProxy() {
  if (proxyServer) return;

  // 启动前先裁剪旧会话，仅保留最近 1 次历史运行（加上本次共严格保留最近 2 次）
  pruneProxyLogKeepLastRuns(logFile, 1);
  log('[Proxy] initProxy starting on preferred port: ' + PREFERRED_PROXY_PORT);

  proxyServer = http.createServer((req, res) => {
    const url = req.url || '';

    // 0. 日志采集与持久化审计端点
    if (url.startsWith('/log-title?')) {
      try {
        const u = new URL('http://127.0.0.1' + url);
        const msg = u.searchParams.get('msg') || '';
        log(`[Title Engine] ${msg}`);
      } catch (e) {}
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('ok');
      return;
    }

    if (url.startsWith('/log-title-persisted?')) {
      try {
        const u = new URL('http://127.0.0.1' + url);
        const id = u.searchParams.get('id') || '';
        const from = u.searchParams.get('from') || '';
        const to = u.searchParams.get('to') || '';
        const source = u.searchParams.get('source') || '';
        const auditMsg = `[会话标题自动中文化] ID=${id} 来源=${source} "${from}" -> "${to}"`;
        log(`[Title Persisted] ${auditMsg}`);
        logAutoPatch(auditMsg);
      } catch (e) {}
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('ok');
      return;
    }

    // 0.5 实时对话标题翻译微服务端点
    if (url === '/translate-title' || url.startsWith('/translate-title?')) {
      handleTranslateTitleRequest(req, res, url);
      return;
    }

    // 0.6 思维链实时流式批量翻译微服务端点与缓存管理
    if (url === '/translate-thought' || url.startsWith('/translate-thought?')) {
      handleTranslateThoughtRequest(req, res);
      return;
    }

    if (url === '/thought-cache-stats') {
      sendJson(res, 200, thoughtTranslator ? { ok: true, ...thoughtTranslator.getCacheStats() } : { ok: false });
      return;
    }

    if (url === '/thought-cache-clear' && req.method === 'POST') {
      sendJson(res, 200, thoughtTranslator ? thoughtTranslator.clearThoughtCache() : { ok: false });
      return;
    }

    log(`[Proxy HTTP] method=${req.method} url=${url}`);

    // 1. 核心拦截：/main.js（内置升级后真身自动热捕获、即时重编与零白屏降级保护）
    if (url === '/main.js' || url.startsWith('/main.js?')) {
      ensureLiveMainSyncedAndCompiled(url)
        .then(decision => {
          if (decision.mode === 'upstream' && decision.buffer) {
            res.writeHead(200, {
              'Content-Type': 'text/javascript; charset=utf-8',
              'Content-Length': decision.buffer.length,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(decision.buffer);
            return;
          }
          if (decision.mode === 'zh' && fs.existsSync(zhMainPath)) {
            const stat = fs.statSync(zhMainPath);
            log(`[Proxy] SERVING ZH MAIN JS! Size: ${stat.size}`);
            res.writeHead(200, {
              'Content-Type': 'text/javascript; charset=utf-8',
              'Content-Length': stat.size,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
              'Access-Control-Allow-Origin': '*'
            });
            fs.createReadStream(zhMainPath).pipe(res);
            return;
          }
          forwardToUpstream(req, res, url);
        })
        .catch(err => {
          log('[Proxy ERROR serving /main.js] ' + err.stack);
          forwardToUpstream(req, res, url);
        });
      return;
    }

    // 2. 其他请求透明转发
    forwardToUpstream(req, res, url);
  });

  // 处理 WebSocket 协议升级
  proxyServer.on('upgrade', (req, clientSocket, head) => {
    log(`[Proxy WS Upgrade] url=${req.url}`);
    if (!targetPort) {
      log('[Proxy WS ERROR] targetPort not set');
      clientSocket.destroy();
      return;
    }

    const targetSocket = net.connect(targetPort, '127.0.0.1', () => {
      targetSocket.write(head);
      let rawHead = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        rawHead += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      }
      rawHead += '\r\n';
      targetSocket.write(rawHead);
      clientSocket.pipe(targetSocket).pipe(clientSocket);
    });

    targetSocket.on('error', err => {
      log(`[Proxy WS Forward Error] ${err.message}`);
      clientSocket.destroy();
    });
    clientSocket.on('error', () => {
      targetSocket.destroy();
    });
  });

  proxyServer.on('error', err => {
    log('[Proxy Server Error] ' + err.stack);
    if (err.code === 'EADDRINUSE') {
      log('[Proxy] Port ' + PREFERRED_PROXY_PORT + ' in use, falling back to ephemeral port');
      proxyServer.listen(0, '127.0.0.1', () => {
        proxyPort = proxyServer.address().port;
        log(`[Proxy] Fallback listening on http://127.0.0.1:${proxyPort}`);
      });
    }
  });

  proxyServer.listen(PREFERRED_PROXY_PORT, '127.0.0.1', () => {
    proxyPort = proxyServer.address().port;
    log(`[Proxy] Listening on http://127.0.0.1:${proxyPort}`);
  });
}

if (process.env.AGY_PROXY_NO_AUTOSTART !== '1') {
  initProxy();
}

function redirectIframeUrl(url) {
  try {
    log(`[redirectIframeUrl input] url=${url}`);
    if (!url || typeof url !== 'string') return url;
    const match = url.match(/^http:\/\/127\.0\.0\.1:(\d+)(\/.*)?$/);
    if (match) {
      const detectedPort = parseInt(match[1], 10);
      if (detectedPort && detectedPort !== proxyPort) {
        targetPort = detectedPort;
        log(`[redirectIframeUrl] targetPort updated to ${targetPort}`);
      }
      const targetProxyPort = proxyPort || PREFERRED_PROXY_PORT;
      const redirected = url.replace(`http://127.0.0.1:${detectedPort}`, `http://127.0.0.1:${targetProxyPort}`);
      log(`[redirectIframeUrl output] ${redirected}`);
      return redirected;
    }
  } catch (e) {
    log(`[redirectIframeUrl ERROR] ${e.stack}`);
  }
  return url;
}

module.exports = {
  redirectIframeUrl,
  getTargetPort: () => targetPort,
  getProxyPort: () => proxyPort,
  handleTranslateTitleRequest,
  handleTranslateThoughtRequest,
  pruneProxyLogKeepLastRuns,
  ensureLiveMainSyncedAndCompiled
};
