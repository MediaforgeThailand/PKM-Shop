insert into public.rag_chunks (
  id,
  title,
  category,
  topic,
  audience,
  language,
  summary,
  content,
  keywords,
  source,
  source_url,
  source_type,
  review_status,
  risk_level,
  medical_reviewer,
  last_reviewed_at,
  expires_at,
  token_budget,
  priority,
  is_active
)
values
  (
    'mock-product-pkg-basic-blood-evidence',
    'Basic Blood Checkup',
    'marketplace.product',
    'pkg_basic_blood',
    'patient',
    'th',
    $$Basic Blood Checkup ราคา 3,500 THB ใช้เป็น baseline ตรวจเลือดพื้นฐาน: CBC, fasting blood sugar, HbA1c, lipid profile, liver และ kidney screen เหมาะกับผู้ใช้ที่ถามเรื่องตรวจเลือด/เจาะเลือด/เช็กน้ำตาล/ไขมัน/ตับ/ไตแบบเริ่มต้น$$,
    $$Product: Basic Blood Checkup ของ Mira Partner Hospital. ราคา 3,500 THB. ระยะเวลา 45-60 mins. หมวดหมู่ Lab checkup.

What it includes: CBC, fasting blood sugar, HbA1c, lipid profile, liver and kidney screen.

Use when: user asks for ตรวจเลือด, เจาะเลือด, ตรวจเลือดพื้นฐาน, เช็กน้ำตาล, น้ำตาลสะสม, ไขมัน, cholesterol, liver, kidney, CBC, or a first health baseline.

Evidence-informed explanation: CBC measures the number and size of blood cells and is commonly used as a general health blood test. HbA1c reflects average blood glucose over about the past 2-3 months. A lipid profile is the standard blood test used to check cholesterol/triglyceride status. Liver function tests measure substances made by the liver and abnormal results usually need more tests for a specific cause. Kidney tests check how well the kidneys are working and may include blood, urine, and imaging tests.

Preparation guidance: fasting depends on the selected test and hospital policy. For glucose and lipid checks, Thai hospital preparation guidance commonly asks users to avoid food and drinks except plain water from the night before. HbA1c, CBC, liver, and kidney tests may not always require fasting, so the hospital instruction is the source of truth. Users should bring ID/order number, previous results, and tell staff about medicines, supplements, pregnancy, chronic disease, or prior reactions to blood draws.

Safety boundary: do not diagnose diabetes, anemia, liver disease, kidney disease, or lipid disease from this package description. Recommend clinician interpretation for abnormal results or symptoms. Escalate urgent symptoms such as chest pain, severe weakness, fainting, breathing difficulty, heavy bleeding, or severe allergic reaction.

Reliable references used for the product education layer: MedlinePlus Complete Blood Count CBC https://medlineplus.gov/lab-tests/complete-blood-count-cbc/ ; MedlinePlus Hemoglobin A1C https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/ ; CDC Cholesterol Testing https://www.cdc.gov/cholesterol/testing/index.html ; MedlinePlus Liver Function Tests https://medlineplus.gov/lab-tests/liver-function-tests/ ; MedlinePlus Kidney Tests https://medlineplus.gov/kidneytests.html ; Chulalongkorn Hospital annual health examination preparation https://kcmh.chulalongkornhospital.go.th/annual-health-examination-program/$$,
    array[
      'pkg_basic_blood',
      'Basic Blood Checkup',
      'ตรวจเลือด',
      'เจาะเลือด',
      'ตรวจเลือดพื้นฐาน',
      'CBC',
      'ซีบีซี',
      'ความสมบูรณ์ของเม็ดเลือด',
      'fasting blood sugar',
      'น้ำตาลในเลือด',
      'HbA1c',
      'น้ำตาลสะสม',
      'lipid profile',
      'ไขมัน',
      'คอเลสเตอรอล',
      'ตับ',
      'ไต',
      'lab checkup',
      'blood test',
      'baseline'
    ],
    'Mira mock product with MedlinePlus, CDC, and Chulalongkorn Hospital references',
    'mira://mock-health-packages/pkg_basic_blood',
    'hospital_operational',
    'approved',
    'medium',
    null,
    '2026-06-10',
    '2027-06-10',
    520,
    12,
    true
  ),
  (
    'mock-product-pkg-heart-metabolic-evidence',
    'Heart & Metabolic Advanced',
    'marketplace.product',
    'pkg_heart_metabolic',
    'patient',
    'th',
    $$Heart & Metabolic Advanced ราคา 12,900 THB เหมาะกับผู้ใช้ที่ถามเรื่องหัวใจ เบาหวาน ไขมัน metabolic risk หรือมีประวัติครอบครัว/ความเครียด/ไม่มี lipid panel ล่าสุด รวม CBC+chemistry, HbA1c/insulin resistance, lipid profile, ECG และ doctor summary$$,
    $$Product: Heart & Metabolic Advanced ของ Aster International Hospital. ราคา 12,900 THB. ระยะเวลา 3-4 hours. หมวดหมู่ Advanced checkup.

What it includes: CBC and chemistry panel, HbA1c and insulin resistance, lipid profile, ECG, doctor summary.

Use when: user asks for ตรวจหัวใจ, metabolic, เบาหวาน, น้ำตาล, ไขมัน, คอเลสเตอรอล, ECG, คลื่นไฟฟ้าหัวใจ, family history, stress, fatigue with cardiometabolic concern, or advanced checkup beyond a basic blood package.

Evidence-informed explanation: metabolic syndrome is a cluster of risk factors that increases risk for heart disease, diabetes, and stroke; core signals include waist/central obesity, triglycerides, HDL, blood pressure, and fasting blood sugar. HbA1c reflects average blood glucose over about 2-3 months. Lipid profile helps assess cholesterol/triglycerides. ECG/EKG records electrical signals in the heart; an abnormal ECG may suggest a heart problem but often needs additional tests before diagnosis.

Preparation guidance: check hospital fasting requirements because lipid/glucose-related tests may require fasting, while ECG itself does not. Bring prior lipid/glucose/BP records, current medicines, supplements, and family history details if available.

Safety boundary: this package can support risk discussion but must not diagnose heart disease, diabetes, arrhythmia, or metabolic syndrome by chat. For chest pain, shortness of breath, fainting, one-sided weakness, severe palpitations, or symptoms that feel urgent, advise emergency care immediately.

Reliable references used for the product education layer: MedlinePlus Metabolic Syndrome https://medlineplus.gov/metabolicsyndrome.html ; MedlinePlus HbA1c https://medlineplus.gov/lab-tests/hemoglobin-a1c-hba1c-test/ ; CDC Cholesterol Testing https://www.cdc.gov/cholesterol/testing/index.html ; MedlinePlus Electrocardiogram https://medlineplus.gov/lab-tests/electrocardiogram/ ; Chulalongkorn Hospital annual health examination preparation https://kcmh.chulalongkornhospital.go.th/annual-health-examination-program/$$,
    array[
      'pkg_heart_metabolic',
      'Heart & Metabolic Advanced',
      'หัวใจ',
      'metabolic',
      'metabolic syndrome',
      'เบาหวาน',
      'น้ำตาล',
      'HbA1c',
      'insulin resistance',
      'ไขมัน',
      'คอเลสเตอรอล',
      'triglyceride',
      'HDL',
      'LDL',
      'ECG',
      'EKG',
      'คลื่นไฟฟ้าหัวใจ',
      'family history',
      'advanced checkup'
    ],
    'Mira mock product with MedlinePlus, CDC, and Chulalongkorn Hospital references',
    'mira://mock-health-packages/pkg_heart_metabolic',
    'hospital_operational',
    'approved',
    'medium',
    null,
    '2026-06-10',
    '2027-06-10',
    520,
    14,
    true
  ),
  (
    'mock-product-pkg-cancer-baseline-evidence',
    'Cancer Risk Baseline',
    'marketplace.product',
    'pkg_cancer_baseline',
    'patient',
    'th',
    $$Cancer Risk Baseline ราคา 18,900 THB ใช้กับคำถามเรื่องวางแผนคัดกรองมะเร็งประจำปี/ประวัติครอบครัว โดยเน้น doctor risk intake, tumor markers, ultrasound abdomen และ lifestyle risk report พร้อม guardrail ว่า tumor markers ไม่ใช่เครื่องมือคัดกรองทั่วไปสำหรับคนไม่มีอาการเสมอไป$$,
    $$Product: Cancer Risk Baseline ของ Sukhumvit Wellness Center. ราคา 18,900 THB. ระยะเวลา Half day. หมวดหมู่ Preventive oncology.

What it includes: doctor risk intake, core tumor markers, ultrasound abdomen, lifestyle risk report.

Use when: user asks for ตรวจมะเร็ง, คัดกรองมะเร็ง, tumor markers, สารบ่งชี้มะเร็ง, ultrasound, อัลตราซาวด์ช่องท้อง, family risk, cancer baseline, or wants a structured annual cancer screening discussion.

Evidence-informed explanation: cancer screening aims to find cancer before symptoms when treatment may be easier. Evidence-based screening depends on age, sex, organ system, family history, personal history, and local guideline. Tumor markers can help in some cancer diagnosis/monitoring contexts, but National Cancer Institute material warns that tumor markers generally do not work well as broad screening tests for asymptomatic people because sensitivity and specificity can be limited. Thailand National Cancer Institute provides cancer knowledge and clinical practice guideline categories including breast, liver/bile duct, lung, cervical, colorectal, and prostate cancer.

Preparation guidance: this package should be framed as risk intake plus selected tests, not a guarantee to rule cancer in or out. Ask the user to bring prior screening results, family cancer history, prior imaging, current symptoms, medicines, pregnancy status, and any previous cancer treatment history. Ultrasound preparation can vary by organ and hospital, so confirm with call center.

Safety boundary: do not reassure that cancer is absent based on a normal tumor marker or ultrasound alone. Do not diagnose cancer from symptoms or chat. Red flags such as unexplained weight loss, blood in stool/urine, persistent lumps, abnormal bleeding, severe pain, or rapidly worsening symptoms should be discussed with a clinician promptly.

Reliable references used for the product education layer: NCI Screening Tests https://www.cancer.gov/about-cancer/screening/screening-tests ; NCI Tumor Markers Fact Sheet https://www.cancer.gov/about-cancer/diagnosis-staging/diagnosis/tumor-markers-fact-sheet ; USPSTF A/B Recommendations https://www.uspreventiveservicestaskforce.org/uspstf/recommendation-topics/uspstf-a-and-b-recommendations ; Thailand National Cancer Institute https://www.nci.go.th/ ; Chulalongkorn Hospital annual health examination preparation https://kcmh.chulalongkornhospital.go.th/annual-health-examination-program/$$,
    array[
      'pkg_cancer_baseline',
      'Cancer Risk Baseline',
      'มะเร็ง',
      'คัดกรองมะเร็ง',
      'ตรวจมะเร็ง',
      'preventive oncology',
      'tumor marker',
      'tumor markers',
      'สารบ่งชี้มะเร็ง',
      'ultrasound',
      'อัลตราซาวด์',
      'ช่องท้อง',
      'family risk',
      'ประวัติครอบครัว',
      'breast cancer',
      'cervical cancer',
      'colorectal cancer',
      'liver cancer',
      'screening'
    ],
    'Mira mock product with NCI, USPSTF, Thailand NCI, and Chulalongkorn Hospital references',
    'mira://mock-health-packages/pkg_cancer_baseline',
    'hospital_operational',
    'approved',
    'high',
    null,
    '2026-06-10',
    '2027-06-10',
    620,
    16,
    true
  ),
  (
    'mock-product-pkg-executive-full-evidence',
    'Executive Longevity Check',
    'marketplace.product',
    'pkg_executive_full',
    'patient',
    'th',
    $$Executive Longevity Check ราคา 24,900 THB ใช้กับผู้ใช้ที่ต้องการตรวจสุขภาพเชิงลึก/optimization/trend tracking รวม advanced blood biomarkers, inflammation markers, hormone panel, nutrition และ sleep review พร้อม guardrail ว่า CRP/hormone markers ต้องแปลผลร่วมกับอาการและแพทย์$$,
    $$Product: Executive Longevity Check ของ Mira Partner Hospital. ราคา 24,900 THB. ระยะเวลา Full day. หมวดหมู่ Longevity.

What it includes: advanced blood biomarkers, inflammation markers, hormone panel, nutrition and sleep review.

Use when: user asks for longevity, ตรวจสุขภาพเชิงลึก, optimization, hormone, ฮอร์โมน, inflammation, CRP, hs-CRP, nutrition, sleep, fatigue optimization, dashboard tracking, or wants the richest package after hospital results are uploaded.

Evidence-informed explanation: CRP is a blood marker related to inflammation and can rise with infection, injury, chronic disease, obesity, and other factors; it is not disease-specific. High-sensitivity CRP can detect smaller increases and may be discussed in cardiovascular risk contexts, but abnormal results usually need clinician interpretation and sometimes repeat or additional tests. Hormone and advanced biomarker panels should be tied to symptoms, medications, age, sex, menstrual/menopause status where relevant, sleep, nutrition, and clinician review.

Preparation guidance: confirm fasting and timing requirements with the hospital because some biomarkers and hormone tests can depend on time of day, medications, supplements, cycle timing, recent illness, exercise, alcohol, and sleep. Bring previous lab results and current medicine/supplement list.

Safety boundary: do not recommend supplements, hormone therapy, medication changes, or a diagnosis based on this package by chat. Position this as a data-rich review for trend tracking and doctor consultation. Escalate urgent symptoms immediately.

Reliable references used for the product education layer: MedlinePlus CRP Test https://medlineplus.gov/lab-tests/c-reactive-protein-crp-test/ ; Mayo Clinic C-reactive protein test https://www.mayoclinic.org/tests-procedures/c-reactive-protein-test/about/pac-20385228 ; MedlinePlus Metabolic Syndrome https://medlineplus.gov/metabolicsyndrome.html ; MedlinePlus Medical Tests https://medlineplus.gov/lab-tests/ ; Chulalongkorn Hospital annual health examination preparation https://kcmh.chulalongkornhospital.go.th/annual-health-examination-program/$$,
    array[
      'pkg_executive_full',
      'Executive Longevity Check',
      'longevity',
      'ตรวจสุขภาพเชิงลึก',
      'optimization',
      'advanced biomarkers',
      'inflammation',
      'อักเสบ',
      'CRP',
      'hs-CRP',
      'hormone',
      'ฮอร์โมน',
      'nutrition',
      'sleep',
      'fatigue',
      'trend tracking',
      'dashboard',
      'premium checkup'
    ],
    'Mira mock product with MedlinePlus, Mayo Clinic, and Chulalongkorn Hospital references',
    'mira://mock-health-packages/pkg_executive_full',
    'hospital_operational',
    'approved',
    'medium',
    null,
    '2026-06-10',
    '2027-06-10',
    560,
    18,
    true
  )
on conflict (id) do update
set
  title = excluded.title,
  category = excluded.category,
  topic = excluded.topic,
  audience = excluded.audience,
  language = excluded.language,
  summary = excluded.summary,
  content = excluded.content,
  keywords = excluded.keywords,
  source = excluded.source,
  source_url = excluded.source_url,
  source_type = excluded.source_type,
  review_status = excluded.review_status,
  risk_level = excluded.risk_level,
  medical_reviewer = excluded.medical_reviewer,
  last_reviewed_at = excluded.last_reviewed_at,
  expires_at = excluded.expires_at,
  token_budget = excluded.token_budget,
  priority = excluded.priority,
  is_active = excluded.is_active,
  embedding = null,
  embedding_model = null,
  embedding_dimensions = null,
  embedding_updated_at = null,
  updated_at = now();
