import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { statementRows, type StatementOptions } from './statementPdf';

// Pure JavaScript PDF generation works in Expo Go as well as native builds.
// The app supplies its bundled Inter font so accented names remain readable.
export async function createStatementPdf(options: StatementOptions, fontData: string | Uint8Array): Promise<string> {
  const { title, rows } = statementRows(options);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // Embed the full font: subsetting Inter can drop visible glyph outlines.
  const font = await pdf.embedFont(fontData);
  pdf.setTitle(`Statement - ${title}`);
  pdf.setCreator('joo');
  const width = 595;
  const height = 842;
  const margin = 44;
  const right = width - margin;
  const dateX = margin;
  const descriptionX = margin + 100;
  const amountX = right - 152;
  const descriptionWidth = amountX - descriptionX - 14;
  const lineHeight = 14;
  let page: PDFPage;
  let y = 0;

  const text = (value: string, x: number, top: number, size = 10, muted = false) => {
    page.drawText(value, { x, y: top, size, font, color: rgb(muted ? 0.35 : 0.07, muted ? 0.35 : 0.07, muted ? 0.35 : 0.07) });
  };
  const rule = (top: number) => page.drawLine({
    start: { x: margin, y: top }, end: { x: right, y: top }, thickness: 0.5, color: rgb(0.82, 0.82, 0.82),
  });
  const addPage = () => {
    page = pdf.addPage([width, height]);
    text(`Statement - ${title}`, margin, height - margin, 17);
    text(`${rows.length} ${rows.length === 1 ? 'transaction' : 'transactions'}`, margin, height - margin - 22, 10, true);
    y = height - margin - 56;
    text('Date', dateX, y);
    text('Description / account', descriptionX, y);
    text('Amount', right - font.widthOfTextAtSize('Amount', 10), y);
    rule(y - 10);
    y -= 30;
  };
  addPage();
  if (rows.length === 0) text('No activity this month.', margin, y, 11, true);
  for (const row of rows) {
    const descriptionLines = wrapText(row.description, font, 10, descriptionWidth);
    const accountLines = wrapText(row.account, font, 9, descriptionWidth);
    const lines = [
      ...descriptionLines.map((value) => ({ value, size: 10, muted: false })),
      ...accountLines.map((value) => ({ value, size: 9, muted: true })),
    ];
    const rowHeight = lines.length * lineHeight + 16;
    if (y - Math.min(rowHeight, height - 180) < margin + 20) addPage();
    let firstSegment = true;
    while (lines.length) {
      const available = Math.max(1, Math.floor((y - margin - 24) / lineHeight));
      const segment = lines.splice(0, available);
      if (firstSegment) {
        text(row.date, dateX, y);
        // Even very large amounts fit the amount column without clipping.
        const size = Math.min(10, 150 / font.widthOfTextAtSize(row.amount, 1));
        text(row.amount, right - font.widthOfTextAtSize(row.amount, size), y, size);
      }
      segment.forEach((line, index) => text(line.value, descriptionX, y - index * lineHeight, line.size, line.muted));
      y -= segment.length * lineHeight + 16;
      rule(y + 18);
      if (lines.length) { addPage(); firstSegment = false; }
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    const label = `${index + 1} / ${pages.length}`;
    p.drawText(label, { x: right - font.widthOfTextAtSize(label, 9), y: 24, font, size: 9, color: rgb(0.45, 0.45, 0.45) });
  });
  return pdf.saveAsBase64();
}

function wrapText(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.replace(/\s+/g, ' ').trim().split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) { line = next; continue; }
    if (line) { lines.push(line); line = ''; }
    for (const char of word) {
      if (line && font.widthOfTextAtSize(line + char, size) > width) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
