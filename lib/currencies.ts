// Canonical currency list — single source of truth for every screen.
//
// `symbol` is the exact display prefix the money screens render: fmt() does
// `${symbol}${value}`, so multi-glyph symbols carry a trailing space
// ('lei ', 'Ft ', 'Fr ') and single glyphs ($, €, £) do not. Settings shows
// "symbol code" in two spots and trims there to avoid a double space.
export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'RON', symbol: 'lei ', name: 'Romanian Leu' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'HUF', symbol: 'Ft ', name: 'Hungarian Forint' },
];
