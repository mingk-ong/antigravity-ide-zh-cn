const http = require('http');
const net = require('net');
const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveLogDir() {
  const envDir = (process.env.AGY_ZH_LOG_DIR || '').trim();
  if (envDir) return envDir;
  const metaPath = path.join(__dirname, '.agy_zh_meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta && meta.logDir) return meta.logDir;
    } catch (_e) {}
  }
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

const PREFERRED_PROXY_PORT = 14588;
let proxyPort = PREFERRED_PROXY_PORT;
let targetPort = 0;
let proxyServer = null;

const zhMainPath = path.join(__dirname, 'hub_main_zh.js');

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

function initProxy() {
  if (proxyServer) return;

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

    // 1. 核心拦截：/main.js
    if (url === '/main.js' || url.startsWith('/main.js?')) {
      try {
        if (fs.existsSync(zhMainPath)) {
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
        } else {
          log('[Proxy ERROR] zhMainPath does not exist: ' + zhMainPath);
        }
      } catch (err) {
        log('[Proxy ERROR serving zh main] ' + err.stack);
      }
    }

    // 2. 其他请求透明转发
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
    // 如果首选端口被占用，回退到动态端口
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
      // 关键修复：从第 0 毫秒起，直接使用预设的固定高位端口 proxyPort 进行重定向！
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
  handleTranslateThoughtRequest
};
