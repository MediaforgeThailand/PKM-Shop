import { localHealthKnowledge, type RagCategory, type RagChunk } from './healthKnowledge';

export type RagMatch = RagChunk & {
  matchedCategories: RagCategory[];
  score: number;
};

export type RagRetrievalOptions = {
  limit?: number;
  maxContextChars?: number;
  preferCategories?: RagCategory[];
};

export type RagContextFormatOptions = {
  includeFullContent?: boolean;
  maxContextChars?: number;
};

const DEFAULT_LIMIT = 3;
const DEFAULT_CONTEXT_CHARS = 1800;

const thaiStopWords = new Set([
  'ครับ',
  'ค่ะ',
  'และ',
  'หรือ',
  'ที่',
  'การ',
  'ของ',
  'ให้',
  'ต้อง',
  'ทำ',
  'ยังไง',
]);

const englishStopWords = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'what',
  'how',
  'can',
  'should',
  'about',
]);

const productDiscoveryTerms = [
  'แพ็กเกจ',
  'แพ็คเกจ',
  'ตรวจสุขภาพ',
  'ตรวจเลือด',
  'เจาะเลือด',
  'แล็บ',
  'โปรดักส์',
  'โปรดัก',
  'สินค้า',
  'บริการ',
  'รายการตรวจ',
  'มีอะไรบ้าง',
  'ทั้งหมด',
  'ราคา',
  'blood test',
  'lab test',
  'checkup',
  'package',
  'product',
];

const intentRules: { categories: RagCategory[]; terms: string[] }[] = [
  {
    categories: ['safety.escalation'],
    terms: [
      'ฉุกเฉิน',
      'เจ็บหน้าอก',
      'หายใจลำบาก',
      'แขนขาอ่อนแรง',
      'หมดสติ',
      'แพ้รุนแรง',
      'เลือดออก',
      'emergency',
      'urgent',
    ],
  },
  {
    categories: ['ops.payment', 'ops.booking'],
    terms: ['จ่ายเงิน', 'ชำระเงิน', 'ใบเสร็จ', 'receipt', 'checkout', 'payment', 'order status'],
  },
  {
    categories: ['ops.booking', 'ops.call_center'],
    terms: ['จองคิว', 'นัด', 'โทรหา', 'call center', 'appointment', 'booking', 'order number'],
  },
  {
    categories: ['ops.referral'],
    terms: ['referral', 'code', 'โค้ด', 'หมอแนะนำ', 'affiliate', 'commission', 'ค่าคอม'],
  },
  {
    categories: ['marketplace.product'],
    terms: productDiscoveryTerms,
  },
  {
    categories: ['care.checkup_preparation'],
    terms: ['ตรวจสุขภาพ', 'ตรวจเลือด', 'เตรียมตัว', 'งดอาหาร', 'เจาะเลือด', 'blood test', 'lab test', 'fasting', 'checkup'],
  },
  {
    categories: ['marketplace.product'],
    terms: [
      'แพ็กเกจ',
      'package',
      'สินค้า',
      'ราคา',
      'บริการ',
      'โรงพยาบาล',
      'รวมอะไร',
      'มีอะไรบ้าง',
      'ตรวจสุขภาพ',
      'ตรวจเลือด',
      'เจาะเลือด',
      'checkup',
      'blood',
      'cbc',
      'lipid',
      'glucose',
      'lab test',
      'blood test',
      'product',
    ],
  },
  {
    categories: ['care.patient_education', 'safety.escalation'],
    terms: ['ความเสี่ยง', 'เสี่ยง', 'อายุ', 'น้ำหนัก', 'ส่วนสูง', 'เพศชาย', 'เพศหญิง', 'bmi', 'risk'],
  },
  {
    categories: ['privacy.consent'],
    terms: ['ข้อมูลสุขภาพ', 'ข้อมูลส่วนตัว', 'ยินยอม', 'ลบข้อมูล', 'consent', 'privacy', 'pdpa'],
  },
];

function toRetrievalOptions(limitOrOptions?: number | RagRetrievalOptions): Required<RagRetrievalOptions> {
  const options = typeof limitOrOptions === 'number' ? { limit: limitOrOptions } : limitOrOptions ?? {};

  return {
    limit: options.limit ?? DEFAULT_LIMIT,
    maxContextChars: options.maxContextChars ?? DEFAULT_CONTEXT_CHARS,
    preferCategories: options.preferCategories ?? [],
  };
}

function normalizeInput(input: string) {
  return input.toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s.-]/gu, ' ');
}

function tokenize(input: string) {
  return normalizeInput(input)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !thaiStopWords.has(token) && !englishStopWords.has(token));
}

function uniqueCategories(categories: RagCategory[]) {
  return [...new Set(categories)];
}

export function classifyRagIntent(query: string): RagCategory[] {
  const normalizedQuery = normalizeInput(query);
  const matchedCategories = intentRules.flatMap((rule) => {
    const matchesRule = rule.terms.some((term) => normalizedQuery.includes(term.toLowerCase()));

    return matchesRule ? rule.categories : [];
  });

  return uniqueCategories(matchedCategories);
}

function scoreChunk(queryTokens: string[], preferredCategories: RagCategory[], chunk: RagChunk) {
  const normalizedQuery = queryTokens.join(' ');
  const haystack = `${chunk.title} ${chunk.category} ${chunk.topic} ${chunk.keywords.join(' ')} ${chunk.summary} ${
    chunk.content
  }`.toLowerCase();

  const categoryMatched = preferredCategories.includes(chunk.category);

  const keywordScore = chunk.keywords.reduce((score, keyword) => {
    const normalizedKeyword = keyword.toLowerCase();

    return normalizedQuery.includes(normalizedKeyword) || haystack.includes(normalizedQuery) ? score + 4 : score;
  }, 0);

  const tokenScore = queryTokens.reduce((score, token) => {
    if (haystack.includes(token)) {
      return score + (chunk.title.toLowerCase().includes(token) ? 3 : 1);
    }

    return score;
  }, 0);
  const relevanceScore = (categoryMatched ? 8 : 0) + keywordScore + tokenScore;

  if (relevanceScore === 0) {
    return 0;
  }

  const priorityScore = Math.max(0, 6 - Math.floor(chunk.priority / 20));

  return relevanceScore + priorityScore;
}

function isFreshChunk(chunk: RagChunk) {
  if (!chunk.expiresAt) {
    return true;
  }

  const expiresAt = new Date(chunk.expiresAt).getTime();

  return Number.isNaN(expiresAt) || expiresAt > Date.now();
}

function eligibleChunks(chunks: RagChunk[], preferredCategories: RagCategory[]) {
  const approvedChunks = chunks.filter((chunk) => chunk.reviewStatus === 'approved' && isFreshChunk(chunk));

  if (preferredCategories.length === 0) {
    return approvedChunks;
  }

  const routedChunks = approvedChunks.filter((chunk) => preferredCategories.includes(chunk.category));

  return routedChunks.length > 0 ? routedChunks : approvedChunks;
}

function trimToBudget(matches: RagMatch[], maxContextChars: number) {
  let usedChars = 0;

  return matches.filter((match) => {
    const nextCost = Math.min(match.tokenBudget * 4, match.summary.length + 160);

    if (usedChars > 0 && usedChars + nextCost > maxContextChars) {
      return false;
    }

    usedChars += nextCost;
    return true;
  });
}

export function retrieveRagContext(
  query: string,
  chunks = localHealthKnowledge,
  limitOrOptions: number | RagRetrievalOptions = DEFAULT_LIMIT,
): RagMatch[] {
  const options = toRetrievalOptions(limitOrOptions);
  const queryTokens = tokenize(query);
  const preferredCategories = uniqueCategories([...options.preferCategories, ...classifyRagIntent(query)]);
  const candidates = eligibleChunks(chunks, preferredCategories);

  if (queryTokens.length === 0) {
    return trimToBudget(
      candidates
        .slice()
        .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title))
        .slice(0, options.limit)
        .map((chunk) => ({ ...chunk, matchedCategories: preferredCategories, score: 0 })),
      options.maxContextChars,
    );
  }

  const scoredMatches = candidates
    .map((chunk) => ({ ...chunk, matchedCategories: preferredCategories, score: scoreChunk(queryTokens, preferredCategories, chunk) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.priority - b.priority || a.title.localeCompare(b.title))
    .slice(0, options.limit);

  return trimToBudget(scoredMatches, options.maxContextChars);
}

export function ensureRagCategoryMatch(
  query: string,
  chunks: RagChunk[],
  matches: RagMatch[],
  category: RagCategory,
  limitOrOptions: number | RagRetrievalOptions = DEFAULT_LIMIT,
): RagMatch[] {
  const options = toRetrievalOptions(limitOrOptions);

  if (matches.some((match) => match.category === category)) {
    return matches;
  }

  const categoryMatches = retrieveRagContext(
    query,
    chunks.filter((chunk) => chunk.category === category),
    {
      ...options,
      limit: 1,
      preferCategories: uniqueCategories([...options.preferCategories, category]),
    },
  );

  if (categoryMatches.length === 0) {
    return matches;
  }

  const requiredIds = new Set(categoryMatches.map((match) => match.id));
  const merged = [...categoryMatches, ...matches.filter((match) => !requiredIds.has(match.id))].slice(0, options.limit);

  return trimToBudget(merged, options.maxContextChars);
}

function clipText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 1)).trim()}...`;
}

export function formatRagContext(matches: RagMatch[], options: RagContextFormatOptions = {}) {
  if (matches.length === 0) {
    return 'No app-specific Mira package or policy snippets matched. Do not mention this to the user. Use general safe health knowledge when relevant, or answer harmless off-topic questions briefly and steer back to health.';
  }

  const maxContextChars = options.maxContextChars ?? DEFAULT_CONTEXT_CHARS;
  const blocks: string[] = [];
  let remainingChars = maxContextChars;

  for (const [index, match] of matches.entries()) {
    const body = options.includeFullContent ? match.content : match.summary || match.content;
    const sourceUrl = match.sourceUrl ? ` | source_url=${match.sourceUrl}` : '';
    const header = `[${index + 1}] id=${match.id} | category=${match.category} | topic=${match.topic} | risk=${
      match.riskLevel
    } | source=${match.source}${sourceUrl}`;
    const maxBodyChars = Math.max(120, Math.min(match.tokenBudget * 4, remainingChars - header.length - 12));
    const block = `${header}\n${clipText(body, maxBodyChars)}`;

    if (blocks.length > 0 && block.length > remainingChars) {
      break;
    }

    blocks.push(clipText(block, remainingChars));
    remainingChars -= block.length + 2;

    if (remainingChars <= 120) {
      break;
    }
  }

  return blocks.join('\n\n');
}
