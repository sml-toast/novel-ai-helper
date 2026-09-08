/**
 * server/novel-epub.js —— 最小合法 EPUB 3 生成（F092）
 *
 * EPUB = OCF（ZIP 容器）+ OPF 包描述 + XHTML 章节。两个硬性规范约束：
 *   1. 「mimetype」条目必须第一个且 STORED（不压缩、无 extra 字段）——
 *      容器识别全靠它，压缩了 Apple Books / Calibre 直接拒开；
 *   2. META-INF/container.xml 指向 OPF 文件位置。
 *
 * 完成度说明（M6 降级口径）：「能被 Apple Books / Calibre / Word 正常打开、
 * 章节可跳转」的最小合法文档 —— 无封面、无 nav.xhtml（EPUB2 风格 toc.ncx
 * 兼容性最好，两代阅读器都认）、正文为纯 XHTML 段落。
 */

import { createZip } from './novel-zip.js';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';
const BOOK_ID = 'urn:novel-ai:export';

/** XML 转义（XHTML 与 OPF/NCX 共用） */
function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 章节正文 → XHTML 段落。空行分段：连续非空行合并为一个段落？
 * 不 —— 写作器正文「一行 = 一个自然段」是本工具的既定习惯（textarea 无富文本），
 * 这里保守地逐行成段、空行输出为留白段，所见即所得。
 * @param {string} content
 */
function contentParagraphs(content) {
  return String(content || '')
    .split('\n')
    .map(line => `      <p>${xmlEscape(line) || '　'}</p>`)
    .join('\n');
}

/**
 * 生成 EPUB 字节流。
 * @param {{project:{title:string, genre?:string, world_view?:string}, chapters:Array<{ordinal:number,title:string,content:string}>, glossary:Array, timeline:Array, foreshadows:Array}} bundle
 * @returns {Buffer}
 */
export function buildEpub(bundle) {
  const { project, chapters } = bundle;

  // ── 章节 XHTML（含可选附录，各自成 spine item，阅读器目录可见）──
  /** @type {{id:string, href:string, title:string, xml:string}[]} */
  const documents = chapters.map(chapter => ({
    id: `chapter-${chapter.ordinal}`,
    href: `chapter-${chapter.ordinal}.xhtml`,
    title: `第 ${chapter.ordinal} 章 · ${chapter.title.replace(/^第\s*\d+\s*章\s*·?\s*/, '')}`,
    xml: `${XML_DECL}
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
  <head><title>${xmlEscape(chapter.title)}</title><meta charset="utf-8"/></head>
  <body>
    <h1>${xmlEscape(`第 ${chapter.ordinal} 章 · ${chapter.title.replace(/^第\s*\d+\s*章\s*·?\s*/, '')}`)}</h1>
${contentParagraphs(chapter.content)}
  </body>
</html>`
  }));

  const appendices = [];
  if (bundle.glossary.length) {
    appendices.push({
      id: 'appendix-glossary', href: 'appendix-glossary.xhtml',
      title: '附录 · 术语表',
      xml: `${XML_DECL}
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
  <head><title>附录 · 术语表</title><meta charset="utf-8"/></head>
  <body><h1>附录 · 术语表</h1>
${bundle.glossary.map(row => `      <p><strong>${xmlEscape(row.term)}</strong>（${xmlEscape(row.category)}）：${xmlEscape(row.definition)}</p>`).join('\n')}
  </body>
</html>`
    });
  }
  if (bundle.timeline.length) {
    appendices.push({
      id: 'appendix-timeline', href: 'appendix-timeline.xhtml',
      title: '附录 · 时间线',
      xml: `${XML_DECL}
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
  <head><title>附录 · 时间线</title><meta charset="utf-8"/></head>
  <body><h1>附录 · 时间线</h1>
${bundle.timeline.map(row => `      <p><strong>${xmlEscape(row.event_time)}</strong> ${xmlEscape(row.title)}：${xmlEscape(row.description)}</p>`).join('\n')}
  </body>
</html>`
    });
  }
  if (bundle.foreshadows.length) {
    appendices.push({
      id: 'appendix-foreshadows', href: 'appendix-foreshadows.xhtml',
      title: '附录 · 伏笔清单',
      xml: `${XML_DECL}
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
  <head><title>附录 · 伏笔清单</title><meta charset="utf-8"/></head>
  <body><h1>附录 · 伏笔清单</h1>
${bundle.foreshadows.map(row => {
  const status = { planted: '已埋设', resolved: '已回收', abandoned: '已废弃' }[row.status] || row.status;
  return `      <p><strong>${xmlEscape(row.title)}</strong>（第 ${row.chapter_ordinal ?? '?'} 章埋设 · ${status}）：${xmlEscape(row.content)}</p>`;
}).join('\n')}
  </body>
</html>`
    });
  }

  const allDocs = [...documents, ...appendices];
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  // ── OPF 包描述（EPUB 3 元数据 + EPUB2 兼容的 toc 属性）──
  const opf = `${XML_DECL}
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="zh-CN">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${BOOK_ID}</dc:identifier>
    <dc:title>${xmlEscape(project.title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>Novel AI 导出</dc:creator>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
${allDocs.map(doc => `    <item id="${doc.id}" href="${doc.href}" media-type="application/xhtml+xml"/>`).join('\n')}
  </manifest>
  <spine toc="ncx">
${allDocs.map(doc => `    <itemref idref="${doc.id}"/>`).join('\n')}
  </spine>
</package>`;

  // ── NCX 目录（EPUB2 风格；Apple Books / Calibre 均识别）──
  const navPoints = allDocs.map((doc, index) => `    <navPoint id="nav-${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${xmlEscape(doc.title)}</text></navLabel>
      <content src="${doc.href}"/>
    </navPoint>`).join('\n');
  const ncx = `${XML_DECL}
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${BOOK_ID}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${xmlEscape(project.title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;

  const containerXml = `${XML_DECL}
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

  return createZip([
    // mimetype 必须第一个条目且 STORED（OCF 规范，见文件头注释）
    { name: 'mimetype', data: 'application/epub+zip', stored: true },
    { name: 'META-INF/container.xml', data: containerXml },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/toc.ncx', data: ncx },
    ...allDocs.map(doc => ({ name: `OEBPS/${doc.href}`, data: doc.xml }))
  ]);
}
