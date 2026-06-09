# Health Chat Companion

Mira chat is designed as one continuous health companion timeline, not a generic multi-thread AI chat. The mobile app can still keep local UI messages, but production persistence should use `chat_sessions.source = companion_timeline` and `chat_messages.metadata.timeline = single_companion`.

## Runtime Contract

`gemini-chat` remains the main Edge Function and now returns a structured payload:

- `text`: short user-facing Thai answer.
- `intent`: `small_talk`, `health_advice`, `product_recommendation`, `product_compare`, `booking`, `checkout`, `safety_escalation`, or `off_topic`.
- `uiCards`: product grid, branch/location, checkout draft, or memory saved cards.
- `memoryWrites`: saved or skipped agent-memory items.
- `contextAssessment`: score 0-100 for whether Mira knows enough to recommend a package, with `mode = ask_context | direct_product | personalized_recommendation`.
- `nextActions`: lightweight action hints for the app UI.
- `ragMatches`: approved public/product/policy RAG chunks used for the answer.

The mobile app should never send full RAG or personal memory context. The Edge Function owns retrieval, prompt assembly, logging, and structured action selection.

## Context Boundaries

- Personal memory: `health_facts` and `agent_memory`, only after `chat_health_memory` consent is granted.
- Product knowledge: `hospital_products` and `rag_chunks` with `category = marketplace.product`.
- Policy and safety knowledge: booking, payment, consent, referral, and safety RAG categories.

Personal health data must not be written into RAG. It belongs in the health data vault and must remain user-scoped through RLS.

## Product Flow

The prototype chat reads product cards from `hospital_products` through the backend response. If Supabase has no active products, the prototype falls back to local demo packages so the sales demo stays usable.

Expected flow:

1. User asks broadly for a checkup.
2. If context score is below 65, chat asks one short follow-up question and returns no product card.
3. If the user asks for a specific service, or context score is ready, chat returns product cards from `hospital_products`.
4. Personalized recommendations show one product card; direct browsing can show up to four.
5. User taps a product, sees one `branch_location` card, then lands on checkout with `productId` and `branchId`.

## Memory Rules

Auto-save is silent only after consent exists. If consent is missing or revoked, chat can answer but must not persist personal memory. Low-confidence health facts are skipped. Users can export, revoke, and delete both confirmed health facts and agent memory from the profile screen.

Context scores follow the same consent rule. Without `chat_health_memory` consent, the score can be used transiently for the current answer but must not be written to `user_context_scores`.
