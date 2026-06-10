# MiraCare Chat — Codex Implementation Handoff

Context for integrating the MiraCare health-consultant chat model into production.
Read the PRIME DIRECTIVE before touching any code.

---

## PRIME DIRECTIVE (non-negotiable)

**The MiraCare prompt (published in OpenAI Platform) is the SOURCE OF TRUTH. The existing codebase must be adapted to fit this model — never the other way around.**

Hard rules:

1. **DO NOT modify the developer message / prompt content** to make it compatible with existing code, existing data shapes, or existing response handling. If the legacy backend sends context in a different shape, change the backend to produce the shapes defined in this document.
2. **DO NOT rename, remove, or re-case the prompt variables.** They are exactly: `brand_name`, `user_nickname`, `personal_context`, `recent_chat`, `product_catalog` (snake_case, lowercase).
3. **DO NOT change the product-card marker protocol** (`[[products: id1, id2]]`). Adapt the frontend/parser to it.
4. **DO NOT swap the model, remove the web search tool, or change reasoning/verbosity settings** to fit legacy latency assumptions without owner approval.
5. If a true conflict is found (something in the prompt design literally cannot work with a platform constraint), **stop and report the conflict with options** — do not silently "fix" it by editing the prompt.
6. Any prompt change that does get approved must be published as a **new version** in OpenAI Platform (never edit-in-place mentally in code) and must pass the regression test suite at the bottom of this document.

Rationale: the prompt has been behavior-tested turn-by-turn (consult flow, objection handling, emergency escalation, card marker emission). Local "small adjustments" break tested behavior in non-obvious ways.

---

## 1. What this is

MiraCare is a white-label Thai health-consultant chat for hospitals/clinics. It consults like a trusted, friendly expert and sells health products (checkup packages, vaccines) directly in chat. Priorities: (1) increase sales via precise recommendations, (2) reduce human chat workload, (3) good UX. Deployment targets: standalone app, PWA, LINE OA.

The hospital's own name replaces "MiraCare" per tenant via the `brand_name` variable. The reply model/persona is ours and identical across tenants.

## 2. Published prompt (OpenAI Platform)

- **Prompt ID:** `pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021`
- **Version:** 2 (default) — use the default version unless told otherwise
- **Model:** `gpt-5.5`, effort `medium`, verbosity `medium`, text output
- **Tools:** Web Search (user location: Thailand) — the model uses it silently for general medical questions outside the provided data. Keep it enabled.
- **store:** MUST be `false` in production requests (real customer health data). `true` is allowed only for synthetic test traffic.

Call via Responses API referencing the prompt ID and passing variables; do not inline-copy the developer message into code. Example:

```ts
const resp = await client.responses.create({
  prompt: {
    id: "pmpt_6a29c7e353b88196a6e648b24c54849e0f6204e24d65c021",
    variables: {
      brand_name: tenant.displayName,
      user_nickname: user.nickname ?? "ลูกค้า",
      personal_context: personalContext, // see §3
      recent_chat: recentChat,           // see §3
      product_catalog: JSON.stringify(catalogRows), // see §4
    },
  },
  input: userMessage,
  store: false,
});
```

## 3. Variables the backend MUST supply on every request

| Variable | Type | Content |
|---|---|---|
| `brand_name` | string | Tenant (hospital/clinic) display name |
| `user_nickname` | string | Customer nickname; fallback `"ลูกค้า"` |
| `personal_context` | string | Confirmed user facts (age, conditions, last checkup...). If none: `"ยังไม่มีข้อมูลส่วนตัวที่ยืนยัน"` |
| `recent_chat` | string | Last 4–8 turns as plain text (`User: ... / Assistant: ...` lines). If none: `"ไม่มีแชทล่าสุด"` |
| `product_catalog` | string | `JSON.stringify` of the tenant's catalog rows (§4). If tenant has none: `"[]"` |

Never send empty strings — use the documented fallbacks. The prompt's anti-repetition behavior ("don't re-ask answered intake questions") depends on `recent_chat` and `personal_context` being populated correctly; this is backend responsibility, not prompt responsibility.

## 4. Product catalog contract

Source: the tenant-managed catalog system (hospitals add/edit their own products in our DB).

JSON array, one object per purchasable product:

```json
[
  {
    "id": "chk-basic",
    "name": "ตรวจสุขภาพพื้นฐาน",
    "description": "น้ำตาล ไขมัน CBC ตับ ไต",
    "price": 1590,
    "image": "https://cdn.example.com/chk-basic.jpg"
  }
]
```

- `id`: stable unique key — the model echoes it in the card marker, the app resolves it back to the DB row. Keep ids short, ascii, kebab/snake case.
- `price`: number, THB.
- `image` is passed through for completeness; the model never describes or links images (per prompt rules) — cards are rendered by the app from the DB, not from model output.
- The model is instructed to NEVER invent products/prices not in this array. If recommendations look wrong, fix the catalog data, not the prompt.
- Keep the array reasonably small (the tenant's sellable items). If a tenant catalog grows large (>50 items), pre-filter server-side by relevance/category before injecting — do not redesign the prompt.

## 5. Product card marker protocol

When a reply names/recommends/quotes any catalog item, the model appends a final line:

```
[[products: chk-basic-plus]]
[[products: chk-basic, chk-premium]]   // comparison case, max 2
```

Frontend/backend handling (build this; it does not exist yet):

1. Parse with `/\n?\[\[products:\s*([^\]]+)\]\]\s*$/` on the assistant text.
2. Strip the marker line from the text shown to the customer — they must never see it.
3. Split ids by comma, trim, look up each in the tenant catalog; render product cards (image, name, price, buy/book CTA) below the message bubble.
4. Unknown id → log it, render nothing for that id, still show the text. Do not crash, do not show the raw marker.
5. No marker → plain text message (greetings, general health answers, emergencies — by design).
6. LINE OA target: render cards as Flex Messages; same parsing rules.

## 6. Conversation flow expectations (already encoded in the prompt — do not re-implement in code)

The model itself handles: one-question-at-a-time intake (max 2–3 questions), immediate answers for direct product/price questions, single-product recommendations with a soft close, objection handling without pushing twice, emergency escalation (ER / 1669) with no products. 

Backend must NOT add its own scripted intake flow, canned sales messages, or template responses on top — that double-layer is exactly what made the previous iteration feel robotic. Backend's job is: supply correct variables, call the API, parse the marker, render.

## 7. Regression test suite (run after ANY change to prompt, variables, or pipeline)

Send in order within one conversation (variables filled with the sample catalog from §4 plus a basic-plus 2990 package; nickname "บอส"):

| # | Send | Pass criteria |
|---|---|---|
| 1 | `สวัสดีครับ` | One short greeting line, no products, no marker |
| 2 | `อยากตรวจสุขภาพ` | Asks exactly ONE question (age). No pitch |
| 3 | `35 ครับ ช่วงนี้กังวลเรื่องน้ำตาล` | Asks ONE next question (last checkup). Does not re-ask age |
| 4 | `จำไม่ได้แล้ว` | Recommends ONE package with reason tied to age/concern + soft close + `[[products: ...]]` with a valid id. Does not re-ask checkup |
| 5 | `แพงไปหน่อย ขอคิดดูก่อน` | Acknowledges once, offers ONE cheaper alternative with marker, leaves door open, no second push |
| 6 | `วัคซีนไข้หวัดใหญ่ราคาเท่าไหร่` | Immediate price from catalog + marker. No interrogation first |
| 7 | `เจ็บแน่นหน้าอก หายใจไม่ค่อยออก` | ER/1669 escalation. No products, NO marker |

Global criteria for every reply: Thai, ค่ะ/คะ register, 1–3 short sentences, max one question, no markdown/bullets, never mentions AI/system/tools/web search, never says "ไม่มีข้อมูลในระบบ", prices only from catalog. A reply that names a catalog product without a marker is a FAIL.

## 8. Things explicitly out of scope for Codex to "improve"

- Persona wording, examples, or style rules in the developer message
- Variable names/casing or the decision to use prompt variables vs. message injection
- The marker format (do not change to JSON tool-calls/function calling without owner approval)
- Model choice, tool list, effort/verbosity
- Adding system prompts on top of the published prompt

If any of these blocks integration, report back with the conflict and proposed options instead of changing them.
