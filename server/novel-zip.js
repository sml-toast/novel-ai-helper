/**
 * server/novel-zip.js —— 零依赖 ZIP 容器构建器（F092）
 *
 * DOCX / EPUB 本质都是 ZIP 包（OOXML / OCF 规范）。Node 内置的 zlib 能做
 * deflate，但不负责 ZIP 容器结构（local header / central directory / CRC32），
 * 因此这里手写最小可用的 ZIP writer：
 *   - STORED（method 0）：原样写入，用于 EPUB 强制要求「第一个未压缩条目 mimetype」
 *   - DEFLATED（method 8）：zlib.deflateRawSync（raw deflate，不带 zlib 头）
 *   - CRC32：Node 22 已内置 zlib.crc32（启动前已实测 22.22.2 可用），不手写查表
 *
 * 兼容性边界：不含 ZIP64（单条目 / 总量远小于 4GB）、不含加密与数据描述符，
 * 全部尺寸先算后写 —— 导出内容都在内存里，长度已知。
 */

import { crc32, deflateRawSync } from 'node:zlib';

/** 本地文件头签名 / 中央目录签名 / 目录结束签名 */
const LFH_SIG = 0x04034b50;
const CDH_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** PKZIP 2.0（版本 20）：deflate 的最低需求，Word / Apple Books 都认 */
const VERSION_NEEDED = 20;
/** General purpose bit 11：文件名按 UTF-8 编码（中文条目名必需） */
const UTF8_FLAG = 0x0800;

/**
 * Date → MS-DOS 时间/日期（ZIP 时间戳只有 2 秒精度、年份从 1980 起）。
 * @param {Date} date
 * @returns {{time:number, day:number}}
 */
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * 构建 ZIP 容器。
 * @param {Array<{name:string, data:Buffer|string, stored?:boolean}>} entries
 *   stored=true 时该条目不压缩（EPUB 的 mimetype 条目必须第一个且 STORED）。
 * @param {{date?:Date}} [options] 时间戳（默认当前时间）
 * @returns {Buffer} 完整 ZIP 字节流
 */
export function createZip(entries, { date = new Date() } = {}) {
  const { time, day } = dosDateTime(date);
  /** @type {Buffer[]} */
  const chunks = [];
  /** 中央目录行：先攒着，local headers 全部写完后统一追加 */
  const directory = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const crc = Number(crc32(raw));
    const stored = entry.stored === true;
    const body = stored ? raw : deflateRawSync(raw, { level: 9 });
    const method = stored ? 0 : 8;

    // ── Local File Header（30 字节固定段 + 文件名）──
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(LFH_SIG, 0);
    lfh.writeUInt16LE(VERSION_NEEDED, 4);
    lfh.writeUInt16LE(UTF8_FLAG, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(time, 10);
    lfh.writeUInt16LE(day, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(body.length, 18); // 压缩后尺寸
    lfh.writeUInt32LE(raw.length, 22); // 原始尺寸
    lfh.writeUInt16LE(nameBuffer.length, 26);
    lfh.writeUInt16LE(0, 28); // extra 长度
    chunks.push(lfh, nameBuffer, body);

    directory.push({ nameBuffer, method, crc, compressedSize: body.length, size: raw.length, offset });
    offset += lfh.length + nameBuffer.length + body.length;
  }

  // ── Central Directory ──
  const cdStart = offset;
  for (const item of directory) {
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(CDH_SIG, 0);
    cdh.writeUInt16LE(VERSION_NEEDED, 4); // version made by
    cdh.writeUInt16LE(VERSION_NEEDED, 6); // version needed
    cdh.writeUInt16LE(UTF8_FLAG, 8);
    cdh.writeUInt16LE(item.method, 10);
    cdh.writeUInt16LE(time, 12);
    cdh.writeUInt16LE(day, 14);
    cdh.writeUInt32LE(item.crc, 16);
    cdh.writeUInt32LE(item.compressedSize, 20);
    cdh.writeUInt32LE(item.size, 24);
    cdh.writeUInt16LE(item.nameBuffer.length, 28);
    cdh.writeUInt16LE(0, 30); // extra
    cdh.writeUInt16LE(0, 32); // comment
    cdh.writeUInt16LE(0, 34); // disk start
    cdh.writeUInt16LE(0, 36); // internal attrs
    cdh.writeUInt32LE(0, 38); // external attrs
    cdh.writeUInt32LE(item.offset, 42); // 指回 local header
    chunks.push(cdh, item.nameBuffer);
    offset += cdh.length + item.nameBuffer.length;
  }
  const cdSize = offset - cdStart;

  // ── End Of Central Directory（22 字节）──
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4); // 本盘号
  eocd.writeUInt16LE(0, 6); // 中央目录起始盘
  eocd.writeUInt16LE(directory.length, 8); // 本盘条目数
  eocd.writeUInt16LE(directory.length, 10); // 总条目数
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 18); // 注释长度
  chunks.push(eocd);

  return Buffer.concat(chunks);
}
