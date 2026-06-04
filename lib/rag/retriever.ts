import { localHealthKnowledge, type RagChunk } from './healthKnowledge';

export type RagMatch = RagChunk & {
  score: number;
};

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

function tokenize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !thaiStopWords.has(token) && !englishStopWords.has(token));
}

function scoreChunk(queryTokens: string[], chunk: RagChunk) {
  const normalizedQuery = queryTokens.join(' ');
  const haystack = `${chunk.title} ${chunk.category} ${chunk.keywords.join(' ')} ${chunk.content}`.toLowerCase();

  const keywordScore = chunk.keywords.reduce((score, keyword) => {
    const normalizedKeyword = keyword.toLowerCase();

    return normalizedQuery.includes(normalizedKeyword) || haystack.includes(normalizedQuery) ? score + 4 : score;
  }, 0);

  return queryTokens.reduce((score, token) => {
    if (haystack.includes(token)) {
      return score + (chunk.title.toLowerCase().includes(token) ? 3 : 1);
    }

    return score;
  }, keywordScore);
}

export function retrieveRagContext(query: string, chunks = localHealthKnowledge, limit = 3): RagMatch[] {
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return chunks.slice(0, limit).map((chunk) => ({ ...chunk, score: 0 }));
  }

  return chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(queryTokens, chunk) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function formatRagContext(matches: RagMatch[]) {
  if (matches.length === 0) {
    return 'No local RAG snippets matched this user question.';
  }

  return matches
    .map(
      (match, index) =>
        `[${index + 1}] ${match.title}\nCategory: ${match.category}\nSource: ${match.source}\nContent: ${match.content}`,
    )
    .join('\n\n');
}
