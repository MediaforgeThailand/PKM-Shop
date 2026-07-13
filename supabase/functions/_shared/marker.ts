// End-anchored, but tolerant of trailing whitespace / emoji / Thai particles the model often
// appends after the marker (e.g. "... [[products: a,b]] 😊" or "... [[categories]] ค่ะ") so the
// card still renders and the literal marker isn't shown to the customer (audit finding).
const MARKER_RE = /\n?\[\[(products|categories|order_status)(?::\s*([^\]]*))?\]\][\s\p{Extended_Pictographic}฀-๿.,!~-]*$/u;
const ANY_MARKER_RE = /\n?\[\[(products|categories|order_status)(?::\s*([^\]]*))?\]\]\s*/g;

export type ChatMarkerType = 'categories' | 'order_status' | 'products';

export type ParsedChatMarker = {
  catalogKeys: string[];
  strippedExtraMarkerCount: number;
  text: string;
  type: ChatMarkerType | null;
};

export function parseChatMarker(raw: string): ParsedChatMarker {
  const match = raw.match(MARKER_RE);

  if (!match) {
    return {
      catalogKeys: [],
      strippedExtraMarkerCount: 0,
      text: raw.trim(),
      type: null,
    };
  }

  const type = match[1] as ChatMarkerType;
  const args = match[2] ?? '';
  const withoutFinalMarker = raw.replace(MARKER_RE, '');
  const strippedExtraMarkerCount = [...withoutFinalMarker.matchAll(ANY_MARKER_RE)].length;
  const text = withoutFinalMarker.replace(ANY_MARKER_RE, '').trim();
  const catalogKeys = type === 'products'
    ? args.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4)
    : [];

  return {
    catalogKeys,
    strippedExtraMarkerCount,
    text,
    type,
  };
}

export function parseProductMarker(raw: string): { text: string; catalogKeys: string[] } {
  const parsed = parseChatMarker(raw);

  return {
    catalogKeys: parsed.type === 'products' ? parsed.catalogKeys : [],
    text: parsed.text,
  };
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
