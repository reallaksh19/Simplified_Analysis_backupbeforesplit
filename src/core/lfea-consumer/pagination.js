import { deepFreeze } from '../shared-piping-model/index.js';

export function createTablePage(rows, requestedPage, pageSize) {
  if (!Array.isArray(rows)) throw new TypeError('Table rows must be an array.');
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new TypeError('Table page size must be a positive integer.');
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = clampPage(requestedPage, totalPages);
  const startIndex = totalRows ? (currentPage - 1) * pageSize : 0;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  return deepFreeze({
    currentPage, totalPages, totalRows, pageSize,
    visibleStart: totalRows ? startIndex + 1 : 0,
    visibleEnd: endIndex,
    rows: rows.slice(startIndex, endIndex),
  });
}

export function normalizeTablePages(tablePages, tableIds) {
  const source = tablePages && typeof tablePages === 'object' && !Array.isArray(tablePages) ? tablePages : {};
  return deepFreeze(Object.fromEntries([...tableIds].sort().map((id) => [id, positivePage(source[id])])));
}

function clampPage(value, totalPages) { const page=positivePage(value); return Math.min(page, totalPages); }
function positivePage(value) { return Number.isInteger(value) && value > 0 ? value : 1; }
