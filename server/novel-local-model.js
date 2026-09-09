/**
 * 本地模型（F093）：端点判定、可行动报错、鉴权头构造。
 *
 * 与云模型的关系：**不另起一套调用路径**。Ollama / LM Studio / llama.cpp 都实现了
 * OpenAI 兼容协议，区别只有两点 ——
 *   1. 通常不需要 API Key（所以不能沿用「没 Key 就不能调」的短路判定）；
 *   2. 需要更具体的报错（「fetch failed」对用户毫无行动指引）。
 * 本模块只解决这两点；模型枚举与连接检测在 novel-ai-probe.js。
 *
 * @module server/novel-local-model.js
 */

/**
 * 常见本地推理服务的预设（设置面板一键填入用）。
 * 放在服务端作为唯一真源：前端通过 /settings/ai/presets 拉取，
 * 且与「报错时提示该启动哪个服务」共用同一份定义，避免两处漂移。
 */
export const LOCAL_PRESETS = [
  {
    id: 'ollama',
    label: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b',
    hint: '终端执行 ollama serve（模型首次使用需 ollama pull qwen2.5:7b）'
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'local-model',
    hint: '在 LM Studio 的 Local Server 页点 Start Server'
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    baseUrl: 'http://127.0.0.1:8080/v1',
    model: 'local-model',
    hint: '启动 llama-server -m 模型.gguf --port 8080'
  },
  {
    id: 'vllm',
    label: 'vLLM / 其他兼容服务',
    baseUrl: 'http://127.0.0.1:8000/v1',
    model: 'local-model',
    hint: '确认服务已监听 8000 端口并暴露 /v1 接口'
  }
];

/** 端口 → 服务名：报错时用来给出「请先启动 X」这种可行动的指引 */
const PORT_SERVICES = {
  '11434': 'Ollama',
  '1234': 'LM Studio',
  '8080': 'llama.cpp server',
  '8000': 'vLLM',
  '5000': '本地 OpenAI 兼容服务'
};

/**
 * 是否本机 / 局域网端点。
 *
 * 判定意义：本地端点**允许没有 API Key**（F093 验收点 4）。
 * 这也是 `canCallReal` 不能写成 `!baseUrl || !apiKey` 的原因 ——
 * 旧写法会把「配了 Ollama 但没填 Key」误判成「完全没配置」而静默降级成 mock。
 *
 * @param {string} baseUrl 形如 http://127.0.0.1:11434/v1
 * @returns {boolean} true 表示回环地址 / 私有网段 / .local 域名
 */
export function isLocalEndpoint(baseUrl) {
  const host = safeHostname(baseUrl);
  if (!host) return false;
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;
  if (/^127\./.test(host)) return true;                    // 127.0.0.0/8
  if (/^10\./.test(host)) return true;                     // 私有网段
  if (/^192\.168\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;               // 链路本地
  const private172 = /^172\.(\d{1,3})\./.exec(host);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return true;         // 172.16.0.0/12
  }
  return /\.local$/.test(host);
}

/** 取主机名（小写、去 IPv6 方括号）；非法 URL 返回空串 */
function safeHostname(baseUrl) {
  try {
    return new URL(String(baseUrl || '')).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return '';
  }
}

/** 「127.0.0.1:11434」这样的展示用地址 —— 报错里必须出现它，用户才知道去看哪个服务 */
export function describeTarget(baseUrl) {
  try {
    const url = new URL(String(baseUrl || ''));
    return `${url.hostname}${url.port ? `:${url.port}` : ''}`;
  } catch {
    return String(baseUrl || '(未填写地址)');
  }
}

/** 端口（解析失败给空串，后续回落到通用文案） */
function portOf(baseUrl) {
  try {
    return new URL(String(baseUrl || '')).port;
  } catch {
    return '';
  }
}

/** 按端口猜服务名，猜不出就统称「本地模型服务」 */
function serviceName(baseUrl) {
  return PORT_SERVICES[portOf(baseUrl)] || '本地模型服务';
}

/** 按端口取预设里的启动指引（无匹配则给通用指引） */
function startHint(baseUrl) {
  const port = portOf(baseUrl);
  const preset = LOCAL_PRESETS.find(item => {
    try {
      return new URL(item.baseUrl).port === port;
    } catch {
      return false;
    }
  });
  return preset ? preset.hint : '确认推理服务已启动且端口与上方地址一致';
}

/**
 * 把底层网络异常翻译成**可行动**的中文提示。
 *
 * Node 的 fetch 失败只给一句 `fetch failed`，真正的 errno 藏在 `error.cause.code`，
 * 用户看到它完全不知道该干什么 —— 这正是 F093 要解决的体验问题。
 *
 * @param {Error} error fetch 抛出的异常
 * @param {string} baseUrl 目标地址
 * @returns {Error} message 为可行动文案；kind = 'local' | 'remote'（供上层决定是否降级 mock）
 */
export function describeEndpointError(error, baseUrl) {
  const target = describeTarget(baseUrl);
  const local = isLocalEndpoint(baseUrl);
  const cause = error?.cause || {};
  const code = String(cause.code || error?.code || '');
  const isAbort = error?.name === 'AbortError' || code === 'ABORT_ERR' || code === 'TimeoutError';

  let reason;
  if (isAbort) {
    reason = '请求超时（等待响应超过 60 秒）';
  } else if (code === 'ECONNREFUSED') {
    reason = '连接被拒绝（该端口没有服务在监听）';
  } else if (code === 'ENOTFOUND') {
    reason = '主机名无法解析（地址拼写可能有误）';
  } else if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    reason = '主机不可达';
  } else if (code === 'ECONNRESET') {
    reason = '连接被对端重置（服务可能正在重启）';
  } else if (/CERT/i.test(code)) {
    reason = 'TLS 证书校验失败';
  } else {
    reason = error?.message || '未知网络错误';
  }

  const message = local
    ? `连不上 ${target}：${reason}。请先启动 ${serviceName(baseUrl)}（${startHint(baseUrl)}）；若端口不同，请把它改成实际地址。本地模型通常不需要 API Key，留空即可。`
    : `调用 ${target} 失败：${reason}。请检查网络、代理设置与 baseURL 是否正确。`;

  return Object.assign(new Error(message), { kind: local ? 'local' : 'remote', code, target });
}

/**
 * HTTP 非 2xx 的可行动提示。
 *
 * 404 对本地服务几乎总是「地址少了 /v1 后缀」—— Ollama 的 OpenAI 兼容接口
 * 挂在 /v1 下，直接填 http://127.0.0.1:11434 会拿到 404，这个提示能省掉一轮排查。
 *
 * @param {number} status HTTP 状态码
 * @param {string} baseUrl 目标地址
 * @param {{hasKey: boolean}} options 是否带了密钥，决定 401 的解释
 * @returns {Error} kind = 'local' | 'remote'；status 保留供上层区分「已翻译的 HTTP 错误」
 */
export function describeHttpError(status, baseUrl, { hasKey = true } = {}) {
  const target = describeTarget(baseUrl);
  const local = isLocalEndpoint(baseUrl);
  let reason;
  if (status === 401 || status === 403) {
    reason = hasKey
      ? `服务返回 HTTP ${status}：API Key 被拒绝，请确认密钥与服务匹配`
      : `服务返回 HTTP ${status}：该服务要求鉴权，请填写 API Key`;
  } else if (status === 404) {
    reason = local
      ? '服务返回 HTTP 404：接口路径不对。地址需以 /v1 结尾（例：http://127.0.0.1:11434/v1）'
      : '服务返回 HTTP 404：接口路径不对，请确认 baseURL';
  } else if (status === 429) {
    reason = '服务返回 HTTP 429：请求过于频繁或额度不足';
  } else if (status >= 500) {
    reason = `服务返回 HTTP ${status}：${local ? '本地推理服务内部错误（可在其控制台查看日志）' : '上游服务异常，可稍后重试'}`;
  } else {
    reason = `服务返回 HTTP ${status}`;
  }
  return Object.assign(new Error(`${reason}（${target}）`), { kind: local ? 'local' : 'remote', status });
}

/**
 * 鉴权头：本地模型没有 Key 时**不发** Authorization ——
 * 空的 `Bearer ` 会被 vLLM 等严格实现直接拒绝，不如干脆不发。
 *
 * @param {string} apiKey 密钥（可为空）
 * @returns {Record<string, string>}
 */
export function buildAuthHeaders(apiKey) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}
