export type HealthFactType =
  | 'allergy'
  | 'blood_type'
  | 'condition'
  | 'demographic'
  | 'family_history'
  | 'hospitalization'
  | 'immunization'
  | 'lab_result'
  | 'lifestyle'
  | 'medication'
  | 'other'
  | 'pregnancy'
  | 'screening'
  | 'surgery'
  | 'symptom'
  | 'vital';

export type ExtractedHealthFact = {
  localId: string;
  factType: HealthFactType;
  label: string;
  value: string;
  normalizedValue?: string;
  unit?: string;
  confidence: number;
  evidenceQuote: string;
};

const conditionTerms = [
  'เบาหวาน',
  'ความดัน',
  'ความดันโลหิตสูง',
  'ไขมันสูง',
  'โรคหัวใจ',
  'หอบหืด',
  'ภูมิแพ้',
  'ไต',
  'ตับ',
  'ไทรอยด์',
  'มะเร็ง',
  'diabetes',
  'hypertension',
  'asthma',
  'heart disease',
];

const symptomTerms = [
  'เจ็บหน้าอก',
  'หายใจลำบาก',
  'ปวดหัว',
  'ปวดท้อง',
  'เวียนหัว',
  'ไข้',
  'ไอ',
  'เหนื่อยง่าย',
  'อ่อนเพลีย',
  'นอนไม่หลับ',
  'chest pain',
  'fever',
  'cough',
  'fatigue',
];

const familyRelationTerms = ['พ่อ', 'แม่', 'พี่', 'น้อง', 'ปู่', 'ย่า', 'ตา', 'ยาย', 'ลุง', 'ป้า', 'อา', 'ญาติ', 'parent', 'mother', 'father', 'sibling', 'grandparent'];

function cleanValue(value: string) {
  return value
    .replace(/[。．.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function createLocalId(type: HealthFactType, value: string, index: number) {
  return `${type}-${index}-${value.toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, '-').slice(0, 32)}`;
}

function addFact(
  facts: ExtractedHealthFact[],
  factType: HealthFactType,
  label: string,
  value: string,
  evidenceQuote: string,
  confidence: number,
  unit?: string,
) {
  const cleanedValue = cleanValue(value);

  if (cleanedValue.length < 2) {
    return;
  }

  const duplicate = facts.some((fact) => fact.factType === factType && fact.value.toLowerCase() === cleanedValue.toLowerCase());

  if (duplicate) {
    return;
  }

  facts.push({
    localId: createLocalId(factType, cleanedValue, facts.length + 1),
    factType,
    label,
    value: cleanedValue,
    normalizedValue: cleanedValue.toLowerCase(),
    unit,
    confidence,
    evidenceQuote: cleanValue(evidenceQuote).slice(0, 500),
  });
}

function extractAllergies(text: string, facts: ExtractedHealthFact[]) {
  const patterns = [
    /แพ้(?:ยา|อาหาร)?\s*([a-zA-Zก-๙0-9+/\-\s]{2,48})/gi,
    /allerg(?:y|ic)(?:\s+to)?\s+([a-zA-Z0-9+/\-\s]{2,48})/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      addFact(facts, 'allergy', 'Allergy', match[1], match[0], 0.82);
    }
  }
}

function extractMedications(text: string, facts: ExtractedHealthFact[]) {
  const patterns = [
    /(?:กินยา|ทานยา|ใช้ยา|ยา)\s*([a-zA-Zก-๙0-9+/\-\s]{2,56})/gi,
    /(?:take|taking|medication|medicine)\s+([a-zA-Z0-9+/\-\s]{2,56})/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      addFact(facts, 'medication', 'Medication', match[1], match[0], 0.68);
    }
  }
}

function extractConditions(text: string, lowerText: string, facts: ExtractedHealthFact[]) {
  for (const term of conditionTerms) {
    if (lowerText.includes(term.toLowerCase())) {
      addFact(facts, 'condition', 'Medical condition', term, term, 0.74);
    }
  }

  const conditionPattern = /(?:โรคประจำตัว|เป็นโรค|เคยเป็น)\s*([a-zA-Zก-๙0-9+/\-\s]{2,56})/gi;

  for (const match of text.matchAll(conditionPattern)) {
    addFact(facts, 'condition', 'Medical condition', match[1], match[0], 0.78);
  }
}

function extractDemographics(text: string, facts: ExtractedHealthFact[]) {
  const agePattern = /(?:อายุ|age)\s*([0-9]{1,3})\s*(?:ปี|years?|yrs?)?/gi;
  const birthYearPattern = /(?:เกิดปี|ปีเกิด|birth year)\s*([12][0-9]{3}|25[0-9]{2})/gi;
  const biologicalSexPattern = /(?:เพศกำเนิด|เพศ|sex(?: at birth)?)\s*(ชาย|หญิง|male|female)/gi;
  const bloodTypePattern = /(?:กรุ๊ปเลือด|หมู่เลือด|blood type)\s*(A|B|AB|O)\s*([+-])?/gi;

  for (const match of text.matchAll(agePattern)) {
    addFact(facts, 'demographic', 'Age', match[1], match[0], 0.86, 'years');
  }

  for (const match of text.matchAll(birthYearPattern)) {
    addFact(facts, 'demographic', 'Birth year', match[1], match[0], 0.8);
  }

  for (const match of text.matchAll(biologicalSexPattern)) {
    addFact(facts, 'demographic', 'Sex at birth', match[1], match[0], 0.68);
  }

  for (const match of text.matchAll(bloodTypePattern)) {
    addFact(facts, 'blood_type', 'Blood type', `${match[1]}${match[2] ?? ''}`, match[0], 0.82);
  }
}

function extractVitals(text: string, facts: ExtractedHealthFact[]) {
  const bloodPressurePattern = /(?:ความดัน|blood pressure|bp)\s*([0-9]{2,3}\s*\/\s*[0-9]{2,3})/gi;
  const weightPattern = /(?:น้ำหนัก|weight)\s*([0-9]{2,3}(?:\.[0-9])?)\s*(?:กก|kg|kilograms?)?/gi;
  const heightPattern = /(?:ส่วนสูง|สูง|height)\s*([0-9]{2,3}(?:\.[0-9])?)\s*(?:ซม|cm|centimeters?)?/gi;
  const heartRatePattern = /(?:ชีพจร|อัตราการเต้นหัวใจ|heart rate|pulse)\s*([0-9]{2,3})\s*(?:bpm)?/gi;
  const temperaturePattern = /(?:อุณหภูมิ|ไข้|temperature)\s*([0-9]{2}(?:\.[0-9])?)\s*(?:c|°c|องศา)?/gi;

  for (const match of text.matchAll(bloodPressurePattern)) {
    addFact(facts, 'vital', 'Blood pressure', match[1], match[0], 0.88, 'mmHg');
  }

  for (const match of text.matchAll(weightPattern)) {
    addFact(facts, 'vital', 'Weight', match[1], match[0], 0.86, 'kg');
  }

  for (const match of text.matchAll(heightPattern)) {
    addFact(facts, 'vital', 'Height', match[1], match[0], 0.86, 'cm');
  }

  for (const match of text.matchAll(heartRatePattern)) {
    addFact(facts, 'vital', 'Heart rate', match[1], match[0], 0.78, 'bpm');
  }

  for (const match of text.matchAll(temperaturePattern)) {
    addFact(facts, 'vital', 'Body temperature', match[1], match[0], 0.72, 'celsius');
  }
}

function extractSymptoms(lowerText: string, facts: ExtractedHealthFact[]) {
  for (const term of symptomTerms) {
    if (lowerText.includes(term.toLowerCase())) {
      addFact(facts, 'symptom', 'Symptom', term, term, 0.62);
    }
  }
}

function extractFamilyHistory(text: string, lowerText: string, facts: ExtractedHealthFact[]) {
  const englishPattern = /family history (?:of|with)?\s*([a-zA-Z0-9+/\-\s]{2,56})/gi;

  for (const match of text.matchAll(englishPattern)) {
    addFact(facts, 'family_history', 'Family history', match[1], match[0], 0.72);
  }

  for (const relation of familyRelationTerms) {
    if (!lowerText.includes(relation.toLowerCase())) {
      continue;
    }

    for (const condition of conditionTerms) {
      if (lowerText.includes(condition.toLowerCase())) {
        addFact(facts, 'family_history', 'Family history', `${relation}: ${condition}`, `${relation} ${condition}`, 0.7);
      }
    }
  }
}

function extractLifestyle(text: string, lowerText: string, facts: ExtractedHealthFact[]) {
  const sleepPattern = /(?:นอน|sleep)\s*([0-9]{1,2}(?:\.[0-9])?)\s*(?:ชม|ชั่วโมง|hours?|hrs?)/gi;
  const exercisePattern = /(?:ออกกำลังกาย|exercise|workout)\s*([a-zA-Zก-๙0-9+/\-\s]{2,48})/gi;

  if (lowerText.includes('สูบบุหรี่') || lowerText.includes('smoke') || lowerText.includes('smoking')) {
    addFact(facts, 'lifestyle', 'Smoking', 'smoking mentioned', 'smoking', 0.68);
  }

  if (lowerText.includes('ไม่สูบบุหรี่') || lowerText.includes('never smoke') || lowerText.includes('non-smoker')) {
    addFact(facts, 'lifestyle', 'Smoking', 'non-smoker', 'non-smoker', 0.78);
  }

  if (lowerText.includes('ดื่มเหล้า') || lowerText.includes('ดื่มแอลกอฮอล์') || lowerText.includes('alcohol')) {
    addFact(facts, 'lifestyle', 'Alcohol', 'alcohol mentioned', 'alcohol', 0.66);
  }

  for (const match of text.matchAll(sleepPattern)) {
    addFact(facts, 'lifestyle', 'Sleep duration', match[1], match[0], 0.78, 'hours');
  }

  for (const match of text.matchAll(exercisePattern)) {
    addFact(facts, 'lifestyle', 'Exercise', match[1], match[0], 0.62);
  }
}

function extractLabsAndScreenings(text: string, facts: ExtractedHealthFact[]) {
  const labPattern =
    /\b(HbA1c|A1C|LDL|HDL|TG|triglycerides?|cholesterol|glucose|FBS|creatinine|eGFR|ALT|AST|Hb|hemoglobin)\b\s*[:=]?\s*([0-9]{1,4}(?:\.[0-9]+)?)\s*(%|mg\/dL|mmol\/L|U\/L|g\/dL|mL\/min)?/gi;
  const thaiLabPattern = /(?:น้ำตาล|ไขมัน|คอเลสเตอรอล|ไตรกลีเซอไรด์|ฮีโมโกลบิน)\s*([0-9]{1,4}(?:\.[0-9]+)?)\s*(?:mg\/dL|mmol\/L|g\/dL)?/gi;
  const screeningPattern = /(?:ตรวจสุขภาพล่าสุด|ตรวจล่าสุด|last physical|screening)\s*([a-zA-Zก-๙0-9+/\-\s]{2,72})/gi;

  for (const match of text.matchAll(labPattern)) {
    addFact(facts, 'lab_result', match[1], match[2], match[0], 0.84, match[3]);
  }

  for (const match of text.matchAll(thaiLabPattern)) {
    addFact(facts, 'lab_result', 'Lab result', match[1], match[0], 0.68);
  }

  for (const match of text.matchAll(screeningPattern)) {
    addFact(facts, 'screening', 'Recent screening', match[1], match[0], 0.68);
  }
}

function extractSurgeriesHospitalizationsAndImmunizations(text: string, facts: ExtractedHealthFact[]) {
  const surgeryPattern = /(?:เคยผ่าตัด|ผ่าตัด|surgery|operation)\s*([a-zA-Zก-๙0-9+/\-\s]{2,72})/gi;
  const hospitalizationPattern = /(?:เคยนอนโรงพยาบาล|นอนโรงพยาบาล|admitted|hospitalized|hospitalisation|hospitalization)\s*([a-zA-Zก-๙0-9+/\-\s]{2,72})/gi;
  const immunizationPattern = /(?:วัคซีน|ฉีดวัคซีน|vaccine|vaccinated)\s*([a-zA-Zก-๙0-9+/\-\s]{2,72})/gi;

  for (const match of text.matchAll(surgeryPattern)) {
    addFact(facts, 'surgery', 'Surgery', match[1], match[0], 0.72);
  }

  for (const match of text.matchAll(hospitalizationPattern)) {
    addFact(facts, 'hospitalization', 'Hospitalization', match[1], match[0], 0.72);
  }

  for (const match of text.matchAll(immunizationPattern)) {
    addFact(facts, 'immunization', 'Immunization', match[1], match[0], 0.72);
  }
}

function extractPregnancy(text: string, lowerText: string, facts: ExtractedHealthFact[]) {
  if (lowerText.includes('ตั้งครรภ์') || lowerText.includes('pregnant')) {
    addFact(facts, 'pregnancy', 'Pregnancy status', 'pregnant', text, 0.7);
  }
}

export function extractHealthFactsFromText(text: string): ExtractedHealthFact[] {
  const normalizedText = cleanValue(text);
  const lowerText = normalizedText.toLowerCase();
  const facts: ExtractedHealthFact[] = [];

  if (normalizedText.length < 4) {
    return facts;
  }

  extractAllergies(normalizedText, facts);
  extractMedications(normalizedText, facts);
  extractConditions(normalizedText, lowerText, facts);
  extractDemographics(normalizedText, facts);
  extractVitals(normalizedText, facts);
  extractSymptoms(lowerText, facts);
  extractFamilyHistory(normalizedText, lowerText, facts);
  extractLifestyle(normalizedText, lowerText, facts);
  extractLabsAndScreenings(normalizedText, facts);
  extractSurgeriesHospitalizationsAndImmunizations(normalizedText, facts);
  extractPregnancy(normalizedText, lowerText, facts);

  return facts.slice(0, 8);
}
