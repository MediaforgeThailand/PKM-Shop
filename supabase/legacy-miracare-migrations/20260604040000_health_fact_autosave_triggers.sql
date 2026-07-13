alter table public.health_facts
  drop constraint if exists health_facts_fact_type_check;

alter table public.health_facts
  add constraint health_facts_fact_type_check
    check (fact_type in (
      'allergy',
      'blood_type',
      'condition',
      'demographic',
      'family_history',
      'hospitalization',
      'immunization',
      'lab_result',
      'lifestyle',
      'medication',
      'other',
      'pregnancy',
      'screening',
      'surgery',
      'symptom',
      'vital'
    ));
