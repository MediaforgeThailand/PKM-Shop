update public.rag_chunks
set
  topic = 'pkg_basic_blood',
  summary = $$Basic Blood Checkup ราคา 3,500 THB เป็นแพ็กเกจตรวจเลือดพื้นฐานของ Mira Partner Hospital สำหรับ baseline สุขภาพ รวม CBC, lipid profile, fasting glucose และ doctor summary เหมาะกับผู้ใช้ที่ถามเรื่องตรวจเลือด/เจาะเลือด/เช็กน้ำตาล/ไขมันแบบเริ่มต้น$$,
  content = $$Product: Basic Blood Checkup ของ Mira Partner Hospital. ราคา 3,500 THB. ระยะเวลาตาม product portal ประมาณ 2-3 ชั่วโมง. หมวดหมู่ Lab checkup.

What it includes from the active hospital product: CBC, lipid profile, fasting glucose, doctor summary.

Use when: user asks for ตรวจเลือด, เจาะเลือด, ตรวจเลือดพื้นฐาน, เช็กน้ำตาล, fasting glucose, ไขมัน, cholesterol, lipid profile, CBC, or a first health baseline.

Evidence-informed explanation: CBC measures the number and size of blood cells and is commonly used as a general health blood test. Fasting glucose is used to check blood sugar status at the time of testing. A lipid profile is the standard blood test used to check cholesterol/triglyceride status. The doctor summary should be used for interpretation because abnormal blood test values need clinical context.

Preparation guidance: fasting depends on the selected test and hospital policy. For fasting glucose and many lipid checks, Thai hospital preparation guidance commonly asks users to avoid food and drinks except plain water from the night before. Users should confirm fasting duration with the hospital call center, bring ID/order number, previous results, and tell staff about medicines, supplements, pregnancy, chronic disease, or prior reactions to blood draws.

Safety boundary: do not diagnose diabetes, anemia, lipid disease, liver disease, or kidney disease from this package description. Do not claim this package includes tests that are not listed in the product. Recommend clinician interpretation for abnormal results or symptoms. Escalate urgent symptoms such as chest pain, severe weakness, fainting, breathing difficulty, heavy bleeding, or severe allergic reaction.

Reliable references used for the product education layer: MedlinePlus Complete Blood Count CBC https://medlineplus.gov/lab-tests/complete-blood-count-cbc/ ; MedlinePlus Blood Glucose https://medlineplus.gov/bloodglucose.html ; CDC Cholesterol Testing https://www.cdc.gov/cholesterol/testing/index.html ; Chulalongkorn Hospital annual health examination preparation https://kcmh.chulalongkornhospital.go.th/annual-health-examination-program/$$,
  keywords = array[
    'pkg_basic_blood',
    'Basic Blood Checkup',
    'ตรวจเลือด',
    'เจาะเลือด',
    'ตรวจเลือดพื้นฐาน',
    'CBC',
    'ซีบีซี',
    'ความสมบูรณ์ของเม็ดเลือด',
    'fasting glucose',
    'fasting blood sugar',
    'น้ำตาลในเลือด',
    'lipid profile',
    'ไขมัน',
    'คอเลสเตอรอล',
    'cholesterol',
    'doctor summary',
    'lab checkup',
    'blood test',
    'baseline'
  ],
  source = 'Mira Partner Hospital product portal with MedlinePlus, CDC, and Chulalongkorn Hospital references',
  source_url = 'mira://hospital-products/823e0c05-569c-4960-b715-84d7608cc415',
  source_type = 'hospital_operational',
  review_status = 'approved',
  risk_level = 'medium',
  medical_reviewer = null,
  last_reviewed_at = '2026-06-10',
  expires_at = '2027-06-10',
  token_budget = 520,
  priority = 12,
  is_active = true,
  embedding = null,
  embedding_model = null,
  embedding_dimensions = null,
  embedding_updated_at = null,
  updated_at = now()
where id = 'hospital-product-823e0c05-569c-4960-b715-84d7608cc415';

update public.rag_chunks
set
  review_status = 'archived',
  is_active = false,
  source = 'Archived duplicate. Merged into hospital-product-823e0c05-569c-4960-b715-84d7608cc415.',
  priority = 90,
  embedding = null,
  embedding_model = null,
  embedding_dimensions = null,
  embedding_updated_at = null,
  updated_at = now()
where id = 'mock-product-pkg-basic-blood-evidence';
