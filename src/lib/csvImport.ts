import type { Trade } from '@/types';

export type ParsedMT5Trade = Omit<Trade, 'id' | 'account_name'>;

export type ParsedImportResult = {
  trades: ParsedMT5Trade[];
  skippedRows: number;
  errors: string[];
};

// MT5 exports vary by broker/terminal build and by whether the user pulled
// the report from the History tab or a custom export script. Rather than
// assume one fixed column order, match header names against known aliases.
const HEADER_ALIASES: Record<string, string[]> = {
  symbol: ['symbol', 'pair'],
  type: ['type', 'direction'],
  volume: ['volume', 'lots', 'lot', 'size', 'volume / lots'],
  openPrice: ['open price', 'price open', 'entry price'],
  closePrice: ['close price', 'price close', 'exit price'],
  profit: ['profit', 'profit/loss', 'p/l', 'pnl', 'net profit'],
  openTime: ['open time', 'time open'],
  closeTime: ['close time', 'time close'],
  commission: ['commission'],
  swap: ['swap'],
};

const NON_TRADE_TYPES = ['balance', 'deposit', 'withdrawal', 'credit', 'correction'];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((cell) => cell.trim());
}

function buildColumnMap(headerRow: string[]): Partial<Record<keyof typeof HEADER_ALIASES, number>> {
  const normalized = headerRow.map((h) => h.trim().toLowerCase());
  const map: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {};

  // Finds the Nth (0-indexed) column whose header matches any of the given
  // aliases. Needed because many MT5 exports reuse generic headers like
  // "Time" and "Price" twice — once for open, once for close.
  const findNth = (aliases: string[], occurrence: number): number | undefined => {
    let seen = 0;
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i])) {
        if (seen === occurrence) return i;
        seen++;
      }
    }
    return undefined;
  };

  const set = (field: keyof typeof HEADER_ALIASES, aliases: string[], occurrence = 0) => {
    if (map[field] !== undefined) return;
    const idx = findNth(aliases, occurrence);
    if (idx !== undefined) map[field] = idx;
  };

  // Single-occurrence fields.
  set('symbol', HEADER_ALIASES.symbol);
  set('type', HEADER_ALIASES.type);
  set('volume', HEADER_ALIASES.volume);
  set('profit', HEADER_ALIASES.profit);
  set('commission', HEADER_ALIASES.commission);
  set('swap', HEADER_ALIASES.swap);

  // Prefer explicit "open X" / "close X" headers when present.
  set('openPrice', ['open price', 'price open', 'entry price']);
  set('closePrice', ['close price', 'price close', 'exit price']);
  set('openTime', ['open time', 'time open']);
  set('closeTime', ['close time', 'time close']);

  // Fall back to positional matching when the export just repeats a
  // generic header (e.g. two "Price" columns, two "Time" columns) — first
  // occurrence is open, second is close.
  if (map.openPrice === undefined) set('openPrice', ['price'], 0);
  if (map.closePrice === undefined) set('closePrice', ['price'], 1);
  if (map.openTime === undefined) set('openTime', ['time', 'date'], 0);
  if (map.closeTime === undefined) set('closeTime', ['time', 'date'], 1);

  return map;
}

function parseNumericCell(raw: string | undefined): number {
  if (!raw) return NaN;
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  return cleaned ? parseFloat(cleaned) : NaN;
}

function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();

  // MT5's usual formats: "2026.08.01 14:32:10" or "2026-08-01 14:32:10"
  const match = cleaned.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Like normalizeDate but keeps time-of-day, needed to compute hold
 * duration for the prohibited-strategy (sub-60s hold) check. Returns an
 * ISO datetime string, or null if unparseable.
 */
function normalizeDateTime(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();

  // MT5's usual format: "2026.08.01 14:32:10" — normalize dots to dashes
  // in the date portion so Date can parse it reliably.
  const match = cleaned.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})[ T](\d{2}):(\d{2})(:(\d{2}))?/);
  if (match) {
    const [, y, m, d, hh, mm, , ss] = match;
    return `${y}-${m}-${d}T${hh}:${mm}:${ss ?? '00'}Z`;
  }

  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  return null;
}

/**
 * Parses an MT5 trade history CSV export into journal-ready trade rows.
 * Tolerant of column ordering and common naming variants; skips rows that
 * aren't closed buy/sell trades (balance ops, deposits, headers, etc).
 */
export function parseMT5Csv(text: string): ParsedImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { trades: [], skippedRows: 0, errors: ['File is empty or has no data rows.'] };
  }

  const header = parseCsvLine(lines[0]);
  const colMap = buildColumnMap(header);

  const missing = (['symbol', 'type', 'profit'] as const).filter((f) => colMap[f] === undefined);
  if (missing.length > 0) {
    return {
      trades: [],
      skippedRows: 0,
      errors: [
        `Missing required column(s): ${missing.join(', ')}. Expected an MT5 trade history export with Symbol, Type and Profit columns.`,
      ],
    };
  }

  const trades: ParsedMT5Trade[] = [];
  let skippedRows = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 2) {
      skippedRows++;
      continue;
    }

    const rawType = (cells[colMap.type!] ?? '').toLowerCase();
    if (NON_TRADE_TYPES.some((t) => rawType.includes(t))) {
      skippedRows++;
      continue;
    }
    if (!['buy', 'sell', 'long', 'short'].includes(rawType)) {
      skippedRows++;
      continue;
    }

    const symbol = cells[colMap.symbol!] ?? '';
    const profit = parseNumericCell(cells[colMap.profit!]);

    if (!symbol || Number.isNaN(profit)) {
      skippedRows++;
      errors.push(`Row ${i + 1}: could not parse symbol or profit, skipped.`);
      continue;
    }

    const openPrice = colMap.openPrice !== undefined ? parseNumericCell(cells[colMap.openPrice]) : NaN;
    const closePrice = colMap.closePrice !== undefined ? parseNumericCell(cells[colMap.closePrice]) : NaN;
    const volume = colMap.volume !== undefined ? parseNumericCell(cells[colMap.volume]) : NaN;
    const commission = colMap.commission !== undefined ? parseNumericCell(cells[colMap.commission]) : NaN;
    const swap = colMap.swap !== undefined ? parseNumericCell(cells[colMap.swap]) : NaN;

    const openTimeRaw = colMap.openTime !== undefined ? cells[colMap.openTime] : undefined;
    const closeTimeRaw = colMap.closeTime !== undefined ? cells[colMap.closeTime] : undefined;

    const dateRaw = closeTimeRaw ?? openTimeRaw;
    const tradeDate = normalizeDate(dateRaw);

    if (!tradeDate) {
      skippedRows++;
      errors.push(`Row ${i + 1}: could not parse a date, skipped.`);
      continue;
    }

    const direction: 'long' | 'short' = rawType === 'sell' || rawType === 'short' ? 'short' : 'long';
    const validOpen = Number.isFinite(openPrice) ? openPrice : 0;
    const validClose = Number.isFinite(closePrice) ? closePrice : validOpen;

    trades.push({
      trade_date: tradeDate,
      pair: symbol.toUpperCase(),
      direction,
      rr_used: '',
      entry_price: validOpen,
      sl: validOpen,
      tp1: validClose,
      tp2: validClose,
      result: profit >= 0 ? 'win' : 'loss',
      dollar_amount: profit,
      notes: 'Imported from MT5',
      close_price: Number.isFinite(closePrice) ? closePrice : undefined,
      lots: Number.isFinite(volume) ? volume : undefined,
      source: 'mt5_import',
      commission: Number.isFinite(commission) ? commission : undefined,
      swap: Number.isFinite(swap) ? swap : undefined,
      open_time: normalizeDateTime(openTimeRaw) ?? undefined,
      close_time: normalizeDateTime(closeTimeRaw) ?? undefined,
    });
  }

  return { trades, skippedRows, errors };
}
