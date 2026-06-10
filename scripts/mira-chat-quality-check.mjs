import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const repoRoot = process.cwd();
const policyPath = path.join(repoRoot, 'lib', 'ai', 'prototypeConversationPolicy.ts');
const edgeFunctionPath = path.join(repoRoot, 'supabase', 'functions', 'mira-chat', 'index.ts');
const prototypePanelPath = path.join(repoRoot, 'components', 'PrototypeChatPanel.tsx');
const miraChatPath = path.join(repoRoot, 'lib', 'ai', 'miraChat.ts');
const openAiPlaybookPath = path.join(repoRoot, 'docs', 'openai-chat-setting-playbook.md');
const chatbotScreenPath = path.join(repoRoot, 'app', '(tabs)', 'chatbot.tsx');
const source = await fs.readFile(policyPath, 'utf8');
const edgeFunctionSource = await fs.readFile(edgeFunctionPath, 'utf8');
const prototypePanelSource = await fs.readFile(prototypePanelPath, 'utf8');
const miraChatSource = await fs.readFile(miraChatPath, 'utf8');
const openAiPlaybookSource = await fs.readFile(openAiPlaybookPath, 'utf8');
const chatbotScreenSource = await fs.readFile(chatbotScreenPath, 'utf8');
const readmeSource = await fs.readFile(path.join(repoRoot, 'README.md'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: policyPath,
}).outputText;
const compiledPath = path.join(repoRoot, '.expo', 'mira-chat-quality-policy.mjs');

await fs.mkdir(path.dirname(compiledPath), { recursive: true });
await fs.writeFile(compiledPath, compiled, 'utf8');

const {
  classifyProductRequest,
  createNaturalHealthFallbackAnswer,
  createPrototypeContextAssessment,
  enforceConversationStyle,
  hasBlockedConversationStyle,
  inferActiveProductRequestKind,
  sanitizeAssistantDisplayText,
} = await import(pathToFileURL(compiledPath).href);

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`${name}: FAIL${detail ? ` - ${detail}` : ''}`);
  }
  console.log(`${name}: PASS`);
}

const firstQuestion = 'สวัสดี อยากตรวจสุขภาพ';
const firstHistory = [{ role: 'user', content: firstQuestion }];
const firstKind = classifyProductRequest(firstQuestion);
const firstActiveKind = inferActiveProductRequestKind(firstHistory, firstKind);
const firstAssessment = createPrototypeContextAssessment(firstQuestion, firstActiveKind, firstHistory, 'บอส');
const firstAnswer = firstAssessment.nextQuestion ?? '';

const secondQuestion = 'จำไม่ได้';
const secondHistory = [
  ...firstHistory,
  { role: 'assistant', content: firstAnswer },
  { role: 'user', content: secondQuestion },
];
const secondKind = classifyProductRequest(secondQuestion);
const secondActiveKind = inferActiveProductRequestKind(secondHistory, secondKind);
const secondAssessment = createPrototypeContextAssessment(secondQuestion, secondActiveKind, secondHistory, 'บอส');
const secondAnswer = secondAssessment.nextQuestion ?? '';

const styleAssessment = createPrototypeContextAssessment('อยากตรวจสุขภาพ', 'broad', [{ role: 'user', content: 'อยากตรวจสุขภาพ' }], 'บอส');
const cleanedStyle = enforceConversationStyle('ถ้าจะวางแผนให้ใช้ได้จริง ขอรู้โซนที่สะดวกหรืองบคร่าวๆ ค่ะ', styleAssessment);
const cleanedFormStyle = enforceConversationStyle('เพื่อประเมินให้เหมาะสม กรุณาให้ข้อมูลที่จำเป็น ได้แก่ อายุ โรคประจำตัว และงบประมาณค่ะ', styleAssessment);
const cleanedDisplayStyle = sanitizeAssistantDisplayText('ถ้าจะวางแผนให้ใช้ได้จริง ขอรู้โซนที่สะดวกหรืองบคร่าวๆ ค่ะ', 'บอส');
const emergencyFallback = createNaturalHealthFallbackAnswer('เจ็บหน้าอก หายใจลำบาก', { userNickname: 'บอส' });
const resultFallback = createNaturalHealthFallbackAnswer('ช่วยอ่านผลตรวจให้หน่อย', { userNickname: 'บอส' });
const prepFallback = createNaturalHealthFallbackAnswer('ตรวจเลือดต้องเตรียมตัวยังไง', { userNickname: 'บอส' });

assert('broad checkup asks recent checkup first', firstKind === 'broad' && firstAnswer.includes('ตรวจสุขภาพครั้งล่าสุด'));
assert('unknown recent checkup stays in broad flow', secondActiveKind === 'broad');
assert('unknown recent checkup advances to age', secondAnswer.includes('อายุประมาณเท่าไหร่'), secondAnswer || 'missing next question');
assert('prep question is health advice, not product flow', classifyProductRequest('อยากตรวจสุขภาพต้องเตรียมตัวยังไง') === 'none');
assert('result question is health advice, not product flow', classifyProductRequest('ช่วยอ่านผลตรวจให้หน่อย') === 'none');
assert('why question is health advice, not product flow', classifyProductRequest('ทำไมต้องตรวจพื้นฐานก่อน') === 'none');
assert('direct blood request remains direct product flow', classifyProductRequest('อยากตรวจเลือด') === 'direct');
assert('broad checkup remains broad', classifyProductRequest('อยากตรวจสุขภาพ') === 'broad');
assert('style cleanup removes blocked wording', !hasBlockedConversationStyle(cleanedStyle), cleanedStyle);
assert('form-style cleanup removes bot wording', !hasBlockedConversationStyle(cleanedFormStyle), cleanedFormStyle);
assert('display scrub removes blocked wording', !hasBlockedConversationStyle(cleanedDisplayStyle), cleanedDisplayStyle);
assert('display scrub asks one clean location question', cleanedDisplayStyle.includes('สะดวกตรวจแถวไหน'), cleanedDisplayStyle);
assert('emergency fallback escalates without blocked style', emergencyFallback.includes('ฉุกเฉิน') && !hasBlockedConversationStyle(emergencyFallback), emergencyFallback);
assert('result fallback asks for lab values without blocked style', resultFallback.includes('ส่งค่าผลตรวจ') && !hasBlockedConversationStyle(resultFallback), resultFallback);
assert('prep fallback stays practical without numbered list', prepFallback.includes('งดอาหาร') && !/^\s*\d+[.)]/m.test(prepFallback), prepFallback);
assert('generated text has no blocked style', !hasBlockedConversationStyle([firstAnswer, secondAnswer, cleanedStyle, cleanedFormStyle, cleanedDisplayStyle, emergencyFallback, resultFallback, prepFallback].join('\n')));

const contextShortcutIndex = edgeFunctionSource.indexOf("finish_reason: 'context_question_shortcut'");
const openAiSecretCheckIndex = edgeFunctionSource.indexOf("if (!openaiApiKey)");

assert('backend has context question shortcut', contextShortcutIndex > -1);
assert('backend asks context before OpenAI call path', contextShortcutIndex > -1 && openAiSecretCheckIndex > -1 && contextShortcutIndex < openAiSecretCheckIndex);
assert('edge function references published MiraCare prompt', edgeFunctionSource.includes('pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021'));
assert('edge function sends OpenAI prompt variables', ['brand_name', 'user_nickname', 'personal_context', 'recent_chat', 'product_catalog'].every((key) => edgeFunctionSource.includes(key)));
assert('edge function disables OpenAI response storage', edgeFunctionSource.includes('store: false'));
assert('edge function parses product marker into UI cards', edgeFunctionSource.includes('parseProductMarker') && edgeFunctionSource.includes('buildProductUiCardsFromMarker'));
assert('prototype fallback has no canned numbered compactTips', !prototypePanelSource.includes('compactTips'));
assert('prototype fallback uses shared natural helper', prototypePanelSource.includes('createNaturalHealthFallbackAnswer') && !prototypePanelSource.includes('function createNaturalDemoText'));
assert('chatbot renders backend UI cards', miraChatSource.includes('uiCards: parseUiCards(data?.uiCards)') && chatbotScreenSource.includes('ChatUiCardRenderer'));
assert('chatbot small-talk shortcut is offline only', chatbotScreenSource.includes('smallTalkAnswer && !canUseAi'));
assert('offline fallback has no numbered RAG list template', !miraChatSource.includes('ragMatches.slice(0, 2).map'));
assert('offline fallback avoids repeated latest-checkup prompt', !miraChatSource.includes('ตรวจล่าสุดเมื่อไหร่คะ ถ้าจำไม่ได้ตอบคร่าวๆ ได้เลย'));
assert('edge function does not compose local instructions', !edgeFunctionSource.includes('instructions:') && !edgeFunctionSource.includes('createSystemInstruction'));
assert('edge function does not read local prompt_versions', !edgeFunctionSource.includes('prompt_versions?select='));
assert('client does not send system prompt override', !miraChatSource.includes('systemPromptOverride') && !chatbotScreenSource.includes('Prompt editor'));
assert('OpenAI chat setting playbook exists with developer message', openAiPlaybookSource.includes('## Developer Message') && openAiPlaybookSource.includes('## Test Prompts'));
assert('OpenAI playbook includes no-repeat acceptance criteria', openAiPlaybookSource.includes('does not ask the same intake question twice'));
assert('client calls mira-chat edge function', /supabase\.functions\.invoke\(\s*['"]mira-chat['"]/.test(miraChatSource));
assert('client no longer calls legacy edge function name', !/supabase\.functions\.invoke\(\s*['"]gemini-chat['"]/.test(miraChatSource));
assert('prototype imports renamed miraChat client', prototypePanelSource.includes("@/lib/ai/miraChat") && !prototypePanelSource.includes("@/lib/ai/gemini"));
assert('README describes OpenAI Platform prompt path', readmeSource.includes('published MiraCare prompt in OpenAI Platform') && readmeSource.includes('active hospital product catalog'));
