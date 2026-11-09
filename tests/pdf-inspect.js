// V5.3 C4: independent reader for the customer PDF (no app code). It checks the file structure the
// way a PDF viewer needs it (header, every xref offset, trailer, startxref, %%EOF), then returns each
// page's size, text (in drawing order) and images (with their JPEG bytes and pixel sizes).
'use strict';
const WIN = { 0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178 };
const latin = (buf) => buf.toString('latin1');

function jpegSize(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) throw new Error('image is not a JPEG (no SOI)');
  if (b[b.length - 2] !== 0xFF || b[b.length - 1] !== 0xD9) throw new Error('JPEG has no EOI (truncated)');
  let i = 2;
  while (i < b.length) { if (b[i] !== 0xFF) throw new Error('bad JPEG marker'); const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xC3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), comps: b[i + 9] };
    i += 2 + len; }
  throw new Error('JPEG has no frame header');
}

function inspectPdf(buf) {
  const s = latin(buf), problems = [];
  if (!s.startsWith('%PDF-1.')) problems.push('no %PDF header');
  if (!/%%EOF\s*$/.test(s)) problems.push('no %%EOF at the end');
  const sx = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(s); if (!sx) throw new Error('no startxref');
  const xref = +sx[1]; if (s.slice(xref, xref + 4) !== 'xref') problems.push('startxref does not point at the xref table');
  const head = /xref\s+0 (\d+)\s+/.exec(s.slice(xref)); const size = +head[1];
  const rows = s.slice(xref + head[0].length).split('\n').slice(0, size).map(r => r.trim());
  const off = {};
  rows.forEach((r, n) => { const m = /^(\d{10}) (\d{5}) ([nf])$/.exec(r); if (!m) { problems.push(`bad xref row ${n}`); return; }
    if (m[3] === 'n') { off[n] = +m[1]; if (!s.startsWith(`${n} 0 obj`, +m[1])) problems.push(`xref offset of object ${n} is wrong`); } });
  const trailer = /trailer\s*<<([\s\S]*?)>>\s*startxref/.exec(s); if (!trailer) problems.push('no trailer');
  const T = trailer ? trailer[1] : ''; if (+(/\/Size (\d+)/.exec(T) || [])[1] !== size) problems.push('trailer /Size does not match xref');
  const obj = (n) => { const start = off[n]; if (start === undefined) throw new Error(`object ${n} missing`);
    const bodyStart = s.indexOf('obj', start) + 3, end = s.indexOf('endobj', bodyStart), body = s.slice(bodyStart, end);
    const st = body.indexOf('stream\n'); if (st < 0) return { dict: body.trim(), stream: null };
    const dict = body.slice(0, st), len = +/\/Length (\d+)/.exec(dict)[1], from = bodyStart + st + 7;
    if (s.slice(from + len, from + len + 10).trim().indexOf('endstream') !== 0) problems.push(`object ${n}: /Length does not end at endstream`);
    return { dict, stream: buf.subarray(from, from + len) }; };
  const ref = (txt, key) => +(new RegExp(`/${key} (\\d+) 0 R`).exec(txt) || [])[1];
  const root = obj(ref(T, 'Root')), pagesN = ref(root.dict, 'Pages'), pages = obj(pagesN), info = obj(ref(T, 'Info')).dict;
  const kids = [...(/\/Kids \[([^\]]*)\]/.exec(pages.dict)[1].matchAll(/(\d+) 0 R/g))].map(m => +m[1]);
  if (+(/\/Count (\d+)/.exec(pages.dict) || [])[1] !== kids.length) problems.push('/Count does not match /Kids');
  const out = kids.map((k) => { const pg = obj(k), mb = /\/MediaBox \[([^\]]+)\]/.exec(pg.dict)[1].trim().split(/\s+/).map(Number);
    const content = latin(Buffer.from(obj(ref(pg.dict, 'Contents')).stream));
    const xo = {}; for (const m of (/\/XObject << ([^>]*) >>/.exec(pg.dict) || [, ''])[1].matchAll(/\/(\w+) (\d+) 0 R/g)) xo[m[1]] = +m[2];
    const texts = [];
    for (const m of content.matchAll(/\((?:\\.|[^\\)])*\) Tj/g)) { let raw = m[0].slice(1, -4), t = '';
      for (let i = 0; i < raw.length; i++) { let c = raw.charCodeAt(i); if (raw[i] === '\\') { i++; c = raw.charCodeAt(i); } t += String.fromCodePoint(WIN[c] || c); }
      texts.push(t); }
    const images = [...content.matchAll(/\/(\w+) Do/g)].map(m => { const o = obj(xo[m[1]]), d = o.dict, bytes = Buffer.from(o.stream), j = jpegSize(bytes);
      return { name: m[1], w: +/\/Width (\d+)/.exec(d)[1], h: +/\/Height (\d+)/.exec(d)[1], filter: (/\/Filter \/(\w+)/.exec(d) || [])[1], jpeg: j, bytes }; });
    const fonts = [...pg.dict.matchAll(/\/(F\d) (\d+) 0 R/g)].map(m => (/\/BaseFont \/([\w-]+)/.exec(obj(+m[2]).dict) || [])[1]);
    return { mediaBox: mb, texts, images, fonts, content }; });
  return { version: s.slice(5, 8), size, pages: out, info, problems };
}
// A PGM (P5) from `pdftoppm -gray`: width, height and pixel bytes.
function readPgm(buf) { const s = latin(buf.subarray(0, 40)), m = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(s); return { w: +m[1], h: +m[2], px: buf.subarray(m[0].length) }; }
module.exports = { inspectPdf, readPgm, jpegSize };
