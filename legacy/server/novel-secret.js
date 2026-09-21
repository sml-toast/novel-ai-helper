// @ts-check
/**
 * server/novel-secret.js —— 零依赖 AI 密钥加密（需求 F075）
 *
 * 背景（架构实测结论，见 doc/design/incremental-design-2026-09-02.md D 节）：
 *   1. 主密钥**必须放在用户目录**，不能放项目内 —— `.data/` 与 `.env` 都在
 *      `.gitignore` 里，主密钥跟仓库一起被清理 = 已存密钥永久不可恢复。
 *      跨进程实测：主密钥丢失后重建，旧密文解密直接失败（GCM 认证不通过）。
 *   2. scrypt N=16384 单次派生约 **30ms**（实测 100 次加密 3053ms）。
 *      AI 调用是热路径，不缓存派生结果会肉眼可见地拖慢每次请求；
 *      缓存后 1000 次取 key 仅 0.31ms。因此 deriveKey 必须带缓存。
 *   3. aes-256-gcm 自带完整性校验：密文被篡改 / salt 不匹配都会抛
 *      "Unsupported state or unable to authenticate data"，不会解出乱码。
 *
 * 密文布局（base64 编码后入库）：iv(12) || authTag(16) || ciphertext
 *
 * 零依赖：仅 node:crypto + node:fs + node:os + node:path。
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const SALT_BYTES = 16;
const MASTER_KEY_BYTES = 32;

/**
 * scrypt 参数：N=16384/r=8/p=1 是 Node 默认档位在强度与耗时间的折中。
 * maxmem 必须显式放宽 —— N=16384 需要约 32MB，超过 Node 默认的 32MB 边界时会抛
 * "Invalid scrypt params"。
 */
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * 主密钥路径。默认 ~/.novel-ai/master.key；
 * NOVEL_MASTER_KEY_PATH 仅用于测试隔离（指向临时目录），生产部署不要设置。
 */
const keyDirDefault = join(homedir(), '.novel-ai');
const masterKeyPath = process.env.NOVEL_MASTER_KEY_PATH
  ? process.env.NOVEL_MASTER_KEY_PATH
  : join(keyDirDefault, 'master.key');

/** 主密钥内存缓存：避免每次缓存未命中都读一次磁盘 */
let masterKeyCache = null;

/**
 * 读取主密钥，不存在则创建。
 *
 * 权限必须显式 chmod：mkdir/writeFile 的 mode 会被进程 umask 裁剪，
 * 实测 umask 022 下 0600 会退化成 0644（同机其他账号可读）。
 *
 * @returns {Buffer} 32 字节主密钥
 * @throws 主密钥文件存在但长度异常时抛出（提示从备份恢复，绝不重建覆盖）
 */
export function loadOrCreateMasterKey() {
  if (masterKeyCache) return masterKeyCache;

  if (existsSync(masterKeyPath)) {
    const key = readFileSync(masterKeyPath);
    if (key.length !== MASTER_KEY_BYTES) {
      // 这里刻意不重建：重建会让所有已存密文永久失效，掩盖真实故障
      throw new Error(`主密钥文件损坏（长度 ${key.length} 字节，应为 ${MASTER_KEY_BYTES}），请从备份恢复 ${masterKeyPath}`);
    }
    masterKeyCache = key;
    return masterKeyCache;
  }

  const keyDir = dirname(masterKeyPath);
  mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  const key = randomBytes(MASTER_KEY_BYTES);
  writeFileSync(masterKeyPath, key, { mode: 0o600 });
  chmodSync(masterKeyPath, 0o600);
  chmodSync(keyDir, 0o700);
  masterKeyCache = key;
  return masterKeyCache;
}

/** 主密钥文件路径（供 UI 展示与备份引导） */
export function getMasterKeyPath() {
  return masterKeyPath;
}

/**
 * 派生结果缓存：salt(base64) -> 32 字节密钥。
 * 见文件头第 2 条，AI 热路径必须命中缓存。
 * @type {Map<string, Buffer>}
 */
const keyCache = new Map();

/**
 * 用主密钥 + salt 派生数据密钥。
 * @param {string} saltB64 salt 的 base64 表示
 * @returns {Buffer} 32 字节数据密钥
 */
function deriveKey(saltB64) {
  const cached = keyCache.get(saltB64);
  if (cached) return cached;
  const master = loadOrCreateMasterKey();
  const derived = scryptSync(master, Buffer.from(saltB64, 'base64'), MASTER_KEY_BYTES, SCRYPT_OPTIONS);
  keyCache.set(saltB64, derived);
  return derived;
}

/**
 * 加密明文密钥。
 * @param {string} plaintext 明文（如 sk-xxxx）
 * @returns {{cipher: string, salt: string}} 均为 base64
 */
export function encryptSecret(plaintext) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(salt.toString('base64')), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    cipher: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64'),
    salt: salt.toString('base64')
  };
}

/**
 * 解密密文。
 * @param {string} cipherB64 encryptSecret 返回的 cipher
 * @param {string} saltB64 encryptSecret 返回的 salt
 * @returns {string} 明文
 * @throws 密文被篡改或主密钥不匹配时抛出（GCM 认证失败）
 */
export function decryptSecret(cipherB64, saltB64) {
  const raw = Buffer.from(String(cipherB64), 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new Error(`密文长度不足（${raw.length} 字节），数据已损坏`);
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(saltB64), raw.subarray(0, IV_BYTES));
  decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
}

/**
 * 掩码展示：接口层永远只出掩码，不出明文。
 * 长度 ≤ 7 时只出 **** —— 否则「前3 + **** + 后4」会泄露几乎全部内容。
 * @param {string} secret 明文密钥
 * @returns {string} 掩码
 */
export function maskSecret(secret) {
  const text = String(secret || '');
  if (!text) return '';
  if (text.length <= 7) return '****';
  return `${text.slice(0, 3)}****${text.slice(-4)}`;
}

/**
 * 主密钥指纹（前 4 字节 hex），用于 UI 提示「本机主密钥是否变更」。
 * 不泄露主密钥内容。
 * @returns {string} 8 位 hex
 */
export function masterKeyFingerprint() {
  return loadOrCreateMasterKey().subarray(0, 4).toString('hex');
}

/**
 * 常量时间比较，避免通过响应时间侧信道推断密钥。
 * @param {string} a 任意字符串
 * @param {string} b 任意字符串
 * @returns {boolean} 是否相等
 */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** 清空派生缓存（仅供测试） */
export function clearKeyCache() {
  keyCache.clear();
}

export { IV_BYTES, TAG_BYTES };
