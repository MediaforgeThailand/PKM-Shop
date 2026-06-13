# LINE OA — Full audit (2026-06-13)

Scope: the entire LINE Official Account path — `line-webhook`, `_shared/line.ts`, the LINE branches of `_shared/orchestrate.ts` (`orchestrateLine`, `createOrderFromProduct`, `handleAction`, `updateCollectingOrderFromMessage`, `completeChatTurn`), `_shared/context.ts`, plus the deployed staging functions on `xwixdxmemwcuoamcloty`.

## Verdict
The LINE flow is **functionally correct and secure** end-to-end. Two issues found and fixed (one orphaned-endpoint hygiene/danger item, one latency item). No money-, tenancy-, or auth-integrity violations.

## What was verified OK
- **Signature auth** — `verifyLineSignature` uses WebCrypto HMAC-SHA256 `verify` on decoded bytes (not string compare); missing/invalid → 401; runs before any event work. Webhook deployed `--no-verify-jwt` by design (LINE has no Supabase JWT).
- **Redelivery idempotency** — events with `deliveryContext.isRedelivery` are skipped (no duplicate orders).
- **Tenant isolation** — per-tenant secrets (`LINE_CHANNEL_SECRET__<slug>` / `_TOKEN`), `?tenant=` routing; customer (`resolveOrCreateLineCustomer`) and session (`resolveOrCreateLatestSession`) are scoped by `tenant_id` + `customer_id`. A forged `?tenant=` still needs that tenant's secret to pass signature verification.
- **Order ownership** — every order-mutating action (`select_branch`, `order_form_submit`, `payment_done`) calls `assertOrderBelongsToSession` and scopes its write by `tenant_id`/`customer_id`/`session_id`. A crafted postback with another customer's `order_id` is rejected. `select_product` only inserts new orders (LINE-deduped per same-product active order).
- **Money integrity** — amounts come from `products.price_baht` at order creation; PromptPay QR from `tenant.promptpay_id`; no price/QR math from model output. `transition_order` (via `transition`) is the only status path — no direct `orders.status` writes in the LINE path.
- **Confirm gate** — `updateCollectingOrderFromMessage` advances to `awaiting_payment` only when fields were already complete AND the message is an affirmation; `maybeAdvanceCollectingOrder` re-checks `missingOrderFields` so it can never advance with missing info.
- **Card suppression** — product/category cards suppressed while an order is in `selecting_branch`/`collecting_info`/`awaiting_payment`.
- **Rate limiting** — `completeChatTurn` enforces the per-customer rate limit; the postback paths that mutate orders run through it.
- **Consent/PDPA** — consent prompt suppressed on LINE (operator-managed) without weakening the fact-write consent gate (facts still skip without consent); `store:false` on model calls.

## Findings & fixes
| # | Severity | Finding | Fix |
|---|---|---|---|
| A | Medium (hygiene/danger) | `line-form` edge function (the abandoned V3-6 LIFF) was still **deployed** on staging with `verify_jwt:false`, while no longer present in the codebase — an orphaned unauthenticated endpoint. (Inert today: no `LINE_LIFF_ID` → GET 500, POST ID-token verify fails.) | **Deleted** the `line-form` function from staging. Not in the deploy allow-list, so it won't be recreated. |
| B | Low (latency) | On postback-driven turns (`select_product`/`select_branch`) `updateCollectingOrderFromMessage` ran the order-field extractor LLM on the canned label (e.g. "เลือกสาขานี้"), adding a wasted model round-trip — part of the "buttons feel slow" report. | Gate the extractor on `!actionResult.order` so it runs only on genuine typed turns. Postback taps now make one model call, not two. |

## Residual recommendations (owner)
- **Prompt versioning**: currently pinned via `MIRA_PROMPT_VERSION=5`. To iterate friction-free, flip the OpenAI Platform **default** to the latest version, then `unset MIRA_PROMPT_VERSION` + redeploy once (R3 end-state). Until the default is flipped, keep the pin (unsetting now would silently fall back to an older default).
- **Webhook redelivery**: keep it **OFF** in the LINE console (belt-and-suspenders with the code-level redelivery skip).
- Perceived latency is dominated by the model call (~2–5s); the LINE loading animation now covers it. If still too slow, consider making `select_product` return a templated branch-step notice (no model call).
