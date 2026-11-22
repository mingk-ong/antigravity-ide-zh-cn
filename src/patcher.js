const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { getTargetPaths, writeDeployMeta } = require('./config');
const { agyCommandsMap } = require('./dictionary');
const { loadCache } = require('./title_translator');
const { execSync } = require('child_process');

/**
 * 计算 VS Code 规范的 SHA-256 base64 校验和 (去除末尾等号)
 */
function computeChecksum(contentBuffer) {
  return crypto.createHash('sha256').update(contentBuffer).digest('base64').replace(/=+$/, '');
}

/**
 * 核心补丁执行引擎
 */

/**
 * 构造注入各核心文件的会话标题中文化与安全兜底引擎代码 (供 workbench yhn / jetskiAgent est 使用)
 */
function buildZhTitleEngine(funcName) {
  const merged = loadCache();
  const idToZh = {
    ...(merged.idToZh || {})
  };
  const phraseToZh = {
    ...(merged.enToZh || {}),
    'Change Software Language To Chinese': '软件界面中文化设置',
    'Search Interface Conversation Title Localization': '搜索界面会话标题中文化'
  };
  const lowerToZh = {};
  for (const [k, v] of Object.entries(phraseToZh)) {
    if (typeof k === 'string' && typeof v === 'string') {
      lowerToZh[k.toLowerCase().trim()] = v;
    }
  }

  return `function ${funcName}(t){
  var _raw = t?.annotations?.title?.trim() || t?.summary?.trim() || t?.title?.trim() || (typeof t==='string'?t.trim():void 0);
  if (!_raw) return void 0;
  if (/[\\u4e00-\\u9fa5]/.test(_raw)) return _raw;
  if (_raw === "Untitled Conversation") return "未命名对话";
  if (_raw === "New Conversation") return "新对话";
  if (_raw === "Coordinator") return "智能体助手";
  if (_raw === "Parent Conversation") return "父级对话";
  var _im = ${JSON.stringify(idToZh)};
  var _pm = ${JSON.stringify(phraseToZh)};
  var _pmLow = ${JSON.stringify(lowerToZh)};
  var _cid = t?.cascadeId || t?.id;
  if (_cid && _im[_cid]) return _im[_cid];
  if (_pm[_raw]) return _pm[_raw];
  var _low = _raw.toLowerCase().trim();
  if (_pmLow[_low]) return _pmLow[_low];
  var _am = {
    add:'添加',analyze:'分析',analysis:'分析',audit:'审计',automate:'自动化',backup:'备份',
    block:'拦截',blocker:'拦截器',build:'构建',bypass:'绕过',change:'修改',check:'检查',
    clean:'清理',cleanup:'清理',compile:'编译',configure:'配置',config:'配置',connect:'连接',
    control:'控制',convert:'转换',copy:'复制',create:'创建',custom:'自定义',debug:'调试',
    delete:'删除',deploy:'部署',deployment:'部署',design:'设计',detect:'检测',detection:'检测',
    develop:'开发',development:'开发',diagnose:'诊断',disable:'禁用',download:'下载',edit:'编辑',
    enable:'启用',enhance:'增强',execute:'执行',export:'导出',extract:'提取',fix:'修复',
    generate:'生成',handle:'处理',implement:'实现',import:'导入',improve:'改进',inject:'注入',
    inspect:'审查',install:'安装',integrate:'集成',intercept:'拦截',investigate:'排查',
    launch:'启动',localize:'中文化',localization:'本地化',locate:'定位',lock:'锁定',login:'登录',
    manage:'管理',merge:'合并',migrate:'迁移',missing:'缺失',modify:'修改',monitor:'监控',
    optimize:'优化',optimization:'优化',parse:'解析',patch:'修补',plan:'规划',preview:'预览',
    publish:'发布',query:'查询',read:'读取',rebuild:'重建',recover:'恢复',redirect:'重定向',
    refactor:'重构',refresh:'刷新',remove:'移除',rename:'重命名',render:'渲染',repair:'修复',
    replace:'替换',reset:'重置',resolve:'解决',restore:'还原',retrieve:'检索',review:'审查',
    run:'运行',save:'保存',scan:'扫描',search:'检索',setup:'配置',solve:'解决',start:'启动',
    stop:'停止',summarize:'总结',summary:'总结',switch:'切换',sync:'同步',test:'测试',
    testing:'测试',track:'跟踪',tracking:'跟踪',translate:'翻译',troubleshoot:'排错',
    unlock:'解锁',update:'更新',upgrade:'升级',verify:'验证',watch:'监听',write:'写入'
  };
  var _nm = {
    account:'账户',agent:'智能体',android:'安卓',api:'API',app:'应用',application:'应用程序',
    architecture:'架构',archive:'归档',artifact:'文档',auth:'认证',backend:'后端',
    browser:'浏览器',bug:'Bug',cache:'缓存',chat:'对话',chrome:'Chrome',client:'客户端',
    cloud:'云端',code:'代码',command:'命令',component:'组件',config:'配置',console:'控制台',
    container:'容器',context:'上下文',conversation:'对话',cookie:'Cookie',crash:'崩溃',
    data:'数据',database:'数据库',desktop:'桌面',device:'设备',docker:'Docker',doc:'文档',
    document:'文档',dom:'DOM',domain:'域名',editor:'编辑器',engine:'引擎',environment:'环境',
    error:'错误',exception:'异常',expense:'支出',extension:'扩展',feature:'特性',file:'文件',
    folder:'文件夹',form:'表单',framework:'框架',frontend:'前端',game:'游戏',gesture:'手势',
    git:'Git',guide:'指南',history:'历史',hook:'钩子',host:'宿主',icon:'图标',ide:'IDE',
    image:'图片',input:'输入',interface:'界面',issue:'问题',java:'Java',javascript:'JavaScript',
    json:'JSON',key:'密钥',keyboard:'键盘',language:'语言',launcher:'启动器',layout:'布局',
    link:'链接',log:'日志',logic:'逻辑',manga:'漫画',markdown:'Markdown',memory:'内存',
    menu:'菜单',message:'消息',metadata:'元数据',mod:'模组',mode:'模式',model:'模型',
    module:'模块',network:'网络',node:'Node',notification:'通知',novel:'小说',page:'页面',
    panel:'面板',path:'路径',performance:'性能',permission:'权限',permissions:'权限',
    platform:'平台',plugin:'插件',policy:'策略',port:'端口',process:'进程',project:'项目',
    prompt:'提示词',proxy:'代理',python:'Python',queue:'队列',quota:'配额',react:'React',
    request:'请求',resource:'资源',response:'响应',route:'路由',rule:'规则',rules:'规则',
    russian:'俄语',sandbox:'沙盒',screen:'页面',script:'脚本',security:'安全',
    sensitivity:'灵敏度',server:'服务器',service:'服务',session:'会话',setting:'设置',
    shortcut:'快捷键',sidebar:'侧边栏',skill:'技能',slide:'滑动',software:'软件',
    source:'源码',sqlite:'SQLite',state:'状态',status:'状态',storage:'存储',string:'字符串',
    subagent:'子智能体',system:'系统',tab:'标签页',table:'表格',task:'任务',template:'模板',
    terminal:'终端',text:'文本',theme:'主题',timeout:'超时',title:'标题',token:'Token',
    tool:'工具',tools:'工具',touch:'触控',ui:'界面',url:'URL',user:'用户',version:'版本',
    view:'视图',warning:'警告',web:'Web',webpage:'网页',website:'网站',webview:'Webview',
    wechat:'微信',window:'窗口',windows:'Windows',workflow:'工作流',workspace:'工作区'
  };
  var _ppm = {and:'与',to:'为',for:'针对',in:'中',with:'配合',of:'的',on:'上',from:'来自'};
  var _lookup = function(_lw) {
    if (_am[_lw]) return _am[_lw];
    if (_nm[_lw]) return _nm[_lw];
    if (_lw.endsWith('ies') && _lw.length > 4) { var _b1 = _lw.slice(0,-3)+'y'; if (_am[_b1]||_nm[_b1]) return _am[_b1]||_nm[_b1]; }
    if (_lw.endsWith('ing') && _lw.length > 5) { var _b2 = _lw.slice(0,-3); if (_am[_b2]||_nm[_b2]) return _am[_b2]||_nm[_b2]; if (_am[_b2+'e']||_nm[_b2+'e']) return _am[_b2+'e']||_nm[_b2+'e']; }
    if (_lw.endsWith('ed') && _lw.length > 4) { var _b3 = _lw.slice(0,-2); if (_am[_b3]||_nm[_b3]) return _am[_b3]||_nm[_b3]; if (_am[_b3+'e']||_nm[_b3+'e']) return _am[_b3+'e']||_nm[_b3+'e']; }
    if (_lw.endsWith('s') && _lw.length > 3) { var _b4 = _lw.slice(0,-1); if (_am[_b4]||_nm[_b4]) return _am[_b4]||_nm[_b4]; }
    return null;
  };
  var _w = _raw.split(/\\s+/);
  var _res = [];
  var _hit = 0;
  for (var _i = 0; _i < _w.length; _i++) {
    var _word = _w[_i];
    var _clean = _word.toLowerCase().replace(/[^a-z0-9]/g, '');
    var _hitWord = _lookup(_clean);
    if (_hitWord) { _res.push(_hitWord); _hit++; }
    else if (_ppm[_clean]) { _res.push(_ppm[_clean]); }
    else { _res.push(_word); }
  }
  if (_hit > 0 && _hit * 2 >= _w.length) {
    var _fin = '';
    for (var _j = 0; _j < _res.length; _j++) {
      var _tk = _res[_j];
      if (!_tk) continue;
      if (!_fin) { _fin = _tk; continue; }
      var _pCh = _fin[_fin.length - 1], _nCh = _tk[0];
      if ((/[A-Za-z0-9]/.test(_pCh) && /[A-Za-z0-9]/.test(_nCh)) ||
          (/[A-Za-z0-9]/.test(_pCh) && /[\\u4e00-\\u9fa5]/.test(_nCh)) ||
          (/[\\u4e00-\\u9fa5]/.test(_pCh) && /[A-Za-z0-9]/.test(_nCh))) {
        _fin += ' ' + _tk;
      } else {
        _fin += _tk;
      }
    }
    _fin = _fin.length > 36 ? _fin.slice(0, 36).trim() : _fin;
    return _fin;
  }
  return _raw;
}`;
}

async function runPatch() {
  const startTime = Date.now();
  console.log('====================================================');
  console.log('  Antigravity IDE 深度全量汉化引擎 (Hub & Webview 增强版)');
  console.log('  覆盖层级: 外层工作台 + 内嵌 Webview Hub 网页应用');
  console.log('====================================================\n');

  const {
    installDir,
    productJsonPath,
    agyExtPackagePath
  } = getTargetPaths();

  if (!fs.existsSync(installDir)) {
    console.error(`❌ 未找到 Antigravity IDE 安装目录: ${installDir}`);
    process.exit(1);
  }

  const appDir = path.join(installDir, 'resources', 'app');
  const agyExtDir = path.join(appDir, 'extensions', 'agy');
  const extJsPath = path.join(agyExtDir, 'vscode', 'extension.js');

  // 1. 备份关键文件
  const filesToBackup = [
    productJsonPath,
    agyExtPackagePath,
    extJsPath
  ];

  for (const filePath of filesToBackup) {
    if (fs.existsSync(filePath)) {
      const backupPath = filePath + '.bak';
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(filePath, backupPath);
        console.log(`[备份] 已创建基础备份: ${path.basename(filePath)}.bak`);
      }
    }
  }

  // 2. 汉化 agy package.json
  if (fs.existsSync(agyExtPackagePath)) {
    try {
      const rawPkg = fs.readFileSync(agyExtPackagePath, 'utf8');
      const pkg = JSON.parse(rawPkg);
      let pkgModified = false;

      if (pkg.contributes && pkg.contributes.commands) {
        for (const cmd of pkg.contributes.commands) {
          if (agyCommandsMap[cmd.command]) {
            cmd.title = agyCommandsMap[cmd.command];
            pkgModified = true;
          }
        }
      }
      if (pkgModified) {
        fs.writeFileSync(agyExtPackagePath, JSON.stringify(pkg, null, 2), 'utf8');
        console.log('✔ [扩展] agy 扩展命令配置汉化完成');
      }
    } catch (e) {
      console.warn('⚠ agy package.json 处理跳过:', e.message);
    }
  }

  // 3. 委托唯一权威构建脚本生成/部署 hub_main_zh.js（避免多套构建策略相互覆盖）
  const ultimateBuildScript = path.join(__dirname, '../build_ultimate_chinese_engine.js');
  if (fs.existsSync(ultimateBuildScript)) {
    console.log('\n[Hub] 调用终极权威引擎构建并部署 hub_main_zh.js...');
    execSync(`"${process.execPath}" "${ultimateBuildScript}"`, { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  } else {
    console.warn('⚠ 未找到 build_ultimate_chinese_engine.js，跳过 Hub 资产重编译');
  }

  // 4. 部署 hub_proxy.js 与标题翻译微服务 title_translator.js
  const proxySrc = path.join(__dirname, 'hub_proxy.template.js');
  const proxyDst = path.join(agyExtDir, 'hub_proxy.js');
  if (fs.existsSync(proxySrc)) {
    fs.copyFileSync(proxySrc, proxyDst);
    console.log(`✔ [代理] 已同步本地 Hub 透明代理模块: ${proxyDst}`);
  }
  const translatorSrc = path.join(__dirname, 'title_translator.js');
  const translatorDst = path.join(agyExtDir, 'title_translator.js');
  if (fs.existsSync(translatorSrc)) {
    fs.copyFileSync(translatorSrc, translatorDst);
    console.log(`✔ [翻译微服务] 已同步标题翻译模块: ${translatorDst}`);
  }
  writeDeployMeta(agyExtDir, __dirname);

  // 5. 注入 extension.js 钩子
  if (fs.existsSync(extJsPath)) {
    let extContent = fs.readFileSync(extJsPath, 'utf8');
    const hookMarker = 'redirectIframeUrl';
    if (!extContent.includes(hookMarker)) {
      const target = 'renderWebviewHtml(a,b,c,d){Jv(a);';
      const replacement = 'renderWebviewHtml(a,b,c,d){try{c=require("../hub_proxy.js").redirectIframeUrl(c)}catch(_e){}Jv(a);';
      if (extContent.includes(target)) {
        extContent = extContent.replace(target, replacement);
        fs.writeFileSync(extJsPath, extContent, 'utf8');
        console.log('✔ [扩展] 已成功注入 Webview 代理拦截重定向钩子');
      } else {
        console.warn('⚠ 未定位到 renderWebviewHtml 注入锚点，跳过');
      }
    } else {
      console.log('✔ [扩展] Webview 代理钩子已存在，无需重复注入');
    }
  }

  
  // 5.5 会话标题双核前端注入 (workbench & jetskiAgent)
  const outDir = path.join(appDir, 'out');
  const wbPath = path.join(outDir, 'vs', 'workbench', 'workbench.desktop.main.js');
  const wbBak = wbPath + '.bak';
  if (fs.existsSync(wbPath)) {
    if (!fs.existsSync(wbBak)) fs.copyFileSync(wbPath, wbBak);
    let wbCode = fs.readFileSync(wbBak, 'utf8');
    const wbTarget = 'function yhn(t){return t?.annotations?.title?.trim()||t?.summary?.trim()||void 0}';
    if (wbCode.includes(wbTarget)) {
      wbCode = wbCode.replace(wbTarget, buildZhTitleEngine('yhn'));
      fs.writeFileSync(wbPath, wbCode, 'utf8');
      console.log('✔ [会话标题] 已成功注入 workbench 标题输出枢纽 yhn(t)');
    }
  }

  const jkPath = path.join(outDir, 'jetskiAgent', 'main.js');
  const jkBak = jkPath + '.bak';
  if (fs.existsSync(jkPath)) {
    if (!fs.existsSync(jkBak)) fs.copyFileSync(jkPath, jkBak);
    let jkCode = fs.readFileSync(jkBak, 'utf8');
    const jkEstTarget = 'function est(e){return e?.annotations?.title?.trim()||e?.summary?.trim()||void 0}';
    if (jkCode.includes(jkEstTarget)) {
      jkCode = jkCode.replace(jkEstTarget, buildZhTitleEngine('est'));
      console.log('✔ [会话标题] 已成功注入 jetskiAgent 标题输出枢纽 est(e)');
    }
    const jkUenTarget = 'let h=u.summary||"Untitled Conversation";';
    const jkUenReplacement = 'let h=est(u)||u.summary||"Untitled Conversation";';
    if (jkCode.includes(jkUenTarget)) {
      jkCode = jkCode.replace(jkUenTarget, jkUenReplacement);
      console.log('✔ [会话标题] 已拦截 uEn 列表渲染函数');
    }
    const jkSmaTarget = 'item:{id:e.cascadeId,label:e.title,';
    const jkSmaReplacement = 'item:{id:e.cascadeId,label:(est(e)||e.title),';
    if (jkCode.includes(jkSmaTarget)) {
      jkCode = jkCode.replace(jkSmaTarget, jkSmaReplacement);
      console.log('✔ [会话标题] 已拦截 sMa 搜索项渲染函数');
    }
    fs.writeFileSync(jkPath, jkCode, 'utf8');
  }

  // 6. 更新 product.json 校验和
  if (fs.existsSync(productJsonPath)) {
    try {
      const prodJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
      if (prodJson.checksums) {
        let syncedCount = 0;
        for (const relPath in prodJson.checksums) {
          const fullTarget = path.join(appDir, 'out', relPath);
          if (fs.existsSync(fullTarget)) {
            const curBuf = fs.readFileSync(fullTarget);
            const curHash = computeChecksum(curBuf);
            if (prodJson.checksums[relPath] !== curHash) {
              prodJson.checksums[relPath] = curHash;
              syncedCount++;
            }
          }
        }
        fs.writeFileSync(productJsonPath, JSON.stringify(prodJson, null, '\t'), 'utf8');
        console.log(`✔ [校验和自愈] product.json 全量自愈同步完成 (共对齐 ${syncedCount} 项，彻底杜绝安装损坏弹窗)`);
      }
    } catch (e) {
      console.warn('⚠ product.json 校验和更新跳过:', e.message);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n====================================================`);
  console.log(`🎉 补丁注入圆满完成！耗时: ${duration} 秒`);
  console.log(`👉 请重启 Antigravity IDE 客户端，查看全中文交互体验！`);
  console.log(`====================================================\n`);
}

runPatch().catch(err => {
  console.error('❌ 补丁执行异常:', err);
  process.exit(1);
});
