# AI assistant: safety and guardrail design

The assistant is a Claude model with four tools (`generate_password`, `generate_passphrase`, `entropy_status`,
`estimate_crack_time`). These are the controls around it. They are deliberately boring and mechanical: safety
here comes from architecture, not from asking the model nicely.

## 1. The model never sees a secret (architectural, not prompt-based)

- Generator tools return **metadata only** — `secret_id`, length, entropy bits, sources, quantum yes/no.
- The secret value is pushed to the browser on a **separate SSE event** keyed by `secret_id`. It never enters the
  model's context, the conversation store, logs, or the usage database.
- Result: prompt injection cannot exfiltrate passwords, because there is nothing in the context to exfiltrate.
  A test asserts the secret string never appears in any request sent to the model API.
- Strength checks of user-typed passwords run **client-side** (zxcvbn in the browser). The server and the model
  never receive a user's existing password.

## 2. Spend can't run away

| Control | Default | Why |
|---|---|---|
| Admission is atomic | — | Caps are checked and a worst-case cost is **reserved** in one critical section before any model call, so N concurrent requests can't all slip under the cap. |
| One stream per user | 1 | Prevents fan-out of long conversations. |
| Reservation survives disconnects and failures | — | Settlement runs in a cancellation-shielded block; failed or abandoned runs keep the worst-case charge. |
| Per-user daily budget | $1.00 | A user's own ceiling, independent of message counts. |
| Global daily / monthly budget | $10 / $150 | Kill switches. When hit, the assistant pauses; password generation is unaffected. |
| Per-user daily messages | 50 | Simple backstop. |
| Max output tokens | 1,500 | Bounded responses. |
| Tool iterations per message | 3 | Bounded agent loop. |
| Secrets per message | 3 | A prompt can't ask for "100 passwords" to drain quantum entropy or quota. |
| Parallel tool calls | disabled | One tool call per model turn. |
| Stream timeout | 90 s | No zombie streams. |
| Prompt caching | on | System prompt + tools + history re-sent every turn are cached. |
| Provider-side limit | recommended | Set a spend limit on the Anthropic workspace as a backstop for bugs in this code. |

## 3. Abuse and content

- **Sign-in required** for the assistant (free generation stays public). Rate limits per user and per IP.
- **Server-side refusal fallbacks** are enabled; a refusal ends the turn with a neutral message, nothing is
  retried in a loop.
- The system prompt forbids asking users for real passwords and instructs the model to describe generated secrets
  by reference ("the 24-character password above") rather than guessing or typing values.
- Model output is rendered as **plain text** in React (no HTML injection), tool names are mapped to fixed labels.
- Conversations are in-memory, per owner, capped (5 per owner, 40 turns each, 1 h TTL). A conversation ID from
  another user is ignored.
- Public `/entropy/status` hides raw provider error text and job identifiers; the model gets the same coarse view.

## 4. Observability

- Every assistant turn records input/output tokens and USD cost per model actually served (server-side fallback
  can switch models, and unknown models are priced at the most expensive tier).
- The admin dashboard shows total and today's AI spend next to usage.
- Logs pass through a redaction filter for password-like fields.

## 5. Reusable checklist for any tool-using LLM feature

1. Keep secrets **out of the context window by construction**; deliver them on a side channel.
2. Reserve cost **before** the call; settle in a shielded `finally`; keep the reservation on failure.
3. One in-flight request per principal; bounded tokens, iterations and tool calls; disable parallel tool use
   unless you need it.
4. Global kill switch in USD, not in message counts.
5. Price by the model that actually answered, not the one you asked for.
6. Render model output as text; map tool names to fixed UI labels.
7. Give the model a **coarse** view of operational status; keep error strings and identifiers for admins.
8. Test the invariant that matters most — here, "the secret never appears in any request to the model API".
