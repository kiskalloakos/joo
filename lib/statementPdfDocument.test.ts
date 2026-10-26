import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { createStatementPdf } from './statementPdfDocument';
import type { StatementOptions } from './statementPdf';

const fontData = readFileSync(require.resolve('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'));
const options: StatementOptions = { monthYear: 2026, monthIndex: 9, transactions: [], accounts: [], currency: 'RON' };

describe('statement PDF document without native printing', () => {
  it('creates a readable A4 PDF for an empty statement', async () => {
    const base64 = await createStatementPdf(options, fontData.toString('base64'));
    const pdf = await PDFDocument.load(base64);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPages()[0].getSize()).toEqual({ width: 595, height: 842 });
    expect(pdf.getTitle()).toBe('Statement - October 2026');
  });

  it('embeds accented names and paginates long lists', async () => {
    const transactions = Array.from({ length: 60 }, (_, index) => ({
      id: String(index), accountId: 'cash', amount: 1234.56, direction: 'out' as const,
      kind: 'manual' as const, referenceId: null, note: `Ákos - cumpărături ${index}: ${'long note '.repeat(12)}`,
      createdAt: new Date(2026, 9, 1 + index % 26, 12).toISOString(),
    }));
    const base64 = await createStatementPdf({ ...options, transactions, accounts: [{ id: 'cash', name: 'Economii în lei', amount: '100', position: 0 }] }, fontData);
    const pdf = await PDFDocument.load(base64);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(Buffer.from(base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
  });
});
