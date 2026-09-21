// @ts-check
/**
 * server/novel-docx.js —— 最小合法 DOCX 生成（F092）
 *
 * DOCX = OOXML 的 ZIP 包。Word / Apple Pages 打开所需的**最小集合**是三个条目：
 *   1. [Content_Types].xml      —— 声明包内部件类型（缺了直接判损坏）
 *   2. _rels/.rels              —— 根关系，指向主文档部件
 *   3. word/document.xml        —— 正文（w:document）
 *
 * 完成度说明（M6 降级口径）：这是「能被 Word / Pages 正常打开、可读可编辑」的
 * 最小合法文档 —— 没有样式表、页眉页脚和目录域，章节标题用加粗大字号近似表达。
 * 正文逐行拆段：Markdown/纯文本的换行在 Word 里就是普通段落，不丢行。
 */

import { createZip } from './novel-zip.js';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** XML 文本转义（正文含 <、&、中文引号都必须安全进 XML） */
function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 一个段落。heading=true 时加粗放大（无样式表下的近似标题）。
 * @param {string} text
 * @param {{heading?:boolean, bold?:boolean}} [options]
 */
function paragraph(text, { heading = false, bold = false } = {}) {
  const size = heading ? 56 : 24; // 半点（w:sz）：标题 28pt，正文 12pt
  const props = heading || bold
    ? `<w:pPr><w:spacing w:after="${heading ? 240 : 120}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr>`
    : `<w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:sz w:val="${size}"/></w:rPr>`;
  // w:t 必须带 xml:space="preserve"，否则 Word 会吃掉行首行尾空格
  return `<w:p>${props}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:p>`;
}

/**
 * 章节正文 → 段落序列。标题行加粗；其余每行一个段落，空行保留为空段（视觉分段）。
 * @param {string} content
 */
function contentParagraphs(content) {
  const lines = String(content || '').split('\n');
  return lines.map(line => paragraph(line, { bold: false }));
}

/**
 * 生成 DOCX 字节流。
 * @param {{project:{title:string, genre?:string}, chapters:Array<{ordinal:number,title:string,content:string,status?:string}>, glossary:Array, timeline:Array, foreshadows:Array}} bundle
 * @returns {Buffer}
 */
export function buildDocx(bundle) {
  const { project, chapters } = bundle;
  /** @type {string[]} */
  const body = [];

  body.push(paragraph(project.title, { heading: true }));
  if (project.genre) body.push(paragraph(`题材：${project.genre}`));

  for (const chapter of chapters) {
    body.push(paragraph(`第 ${chapter.ordinal} 章 · ${chapter.title.replace(/^第\s*\d+\s*章\s*·?\s*/, '')}`, { heading: true }));
    body.push(...contentParagraphs(chapter.content));
  }

  if (bundle.glossary.length) {
    body.push(paragraph('附录 · 术语表', { heading: true }));
    for (const row of bundle.glossary) body.push(paragraph(`${row.term}（${row.category}）：${row.definition}`));
  }
  if (bundle.timeline.length) {
    body.push(paragraph('附录 · 时间线', { heading: true }));
    for (const row of bundle.timeline) body.push(paragraph(`${row.event_time} ${row.title}：${row.description}`));
  }
  if (bundle.foreshadows.length) {
    body.push(paragraph('附录 · 伏笔清单', { heading: true }));
    for (const row of bundle.foreshadows) {
      const status = { planted: '已埋设', resolved: '已回收', abandoned: '已废弃' }[row.status] || row.status;
      body.push(paragraph(`${row.title}（第 ${row.chapter_ordinal ?? '?'} 章埋设 · ${status}）：${row.content}`));
    }
  }

  const documentXml = `${XML_DECL}
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body.join('\n    ')}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `${XML_DECL}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rootRels = `${XML_DECL}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  return createZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'word/document.xml', data: documentXml }
  ]);
}
