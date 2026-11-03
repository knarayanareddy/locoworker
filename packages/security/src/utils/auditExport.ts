/**
 * Bounded audit-log export payloads (R-11).
 *
 * The dashboard used to `JSON.stringify(await log.read(0))` over the entire
 * history. This helper enforces both a row cap (applied by the caller before
 * passing rows) and a serialised-byte cap, keeping the *newest* rows when the
 * body would otherwise be too large.
 */
export interface AuditExportResult {
  body: string;
  included: number;
  total: number;
  truncated: boolean;
  bytes: number;
}

export function serializeAuditExport(
  rows: readonly unknown[],
  maxBytes: number,
): AuditExportResult {
  const budget = Math.max(2, Math.trunc(maxBytes) || 2);
  let included = rows.length;
  let body = JSON.stringify(rows.slice(rows.length - included), null, 2);

  while (Buffer.byteLength(body, "utf8") > budget && included > 0) {
    included = Math.floor(included / 2);
    body = JSON.stringify(rows.slice(rows.length - included), null, 2);
  }

  return {
    body,
    included,
    total: rows.length,
    truncated: included < rows.length,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}
