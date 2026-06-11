const MARKER_RE = /\n?\[\[products:\s*([^\]]+)\]\]\s*$/;

export function parseProductMarker(raw: string): { text: string; catalogKeys: string[] } {
  const m = raw.match(MARKER_RE);
  if (!m) return { text: raw.trim(), catalogKeys: [] };
  const catalogKeys = m[1].split(',').map(s => s.trim()).filter(Boolean).slice(0, 2);
  return { text: raw.replace(MARKER_RE, '').trim(), catalogKeys };
}

export function filterKnownProductMarkerKeys(
  catalogKeys: string[],
  knownCatalogKeys: Iterable<string>,
  onUnknown?: (unknownKeys: string[]) => void,
) {
  const known = new Set(knownCatalogKeys);
  const unknownKeys = catalogKeys.filter((key) => !known.has(key));

  if (unknownKeys.length > 0) {
    onUnknown?.(unknownKeys);
  }

  return catalogKeys.filter((key) => known.has(key));
}
