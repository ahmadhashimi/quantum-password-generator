/**
 * Runtime-validated response shapes for every FastAPI endpoint the web app reads. Request types come from the
 * OpenAPI-generated schema.d.ts; responses are validated here at the fetch boundary.
 * Receipt payloads stay loosely typed on purpose: they are verified from the raw text (lib/verify), never
 * reshaped by a schema.
 */
import { z } from "zod";

export const Provenance = z.looseObject({
  sources: z.array(z.string()),
  quantum: z.boolean(),
  quantum_bytes: z.number(),
  mixed_with: z.string(),
  failures: z.record(z.string(), z.string()).optional(),
  health: z.record(z.string(), z.string()).optional(),
  ibm_jobs: z.array(z.looseObject({ backend: z.string().nullable().optional(), job_id: z.string().nullable().optional(),
                                    mode: z.string().optional() })).optional(),
  timestamp: z.number().optional(),
});
export type Provenance = z.infer<typeof Provenance>;

export const ReceiptPayload = z.looseObject({
  version: z.string(),
  receipt_id: z.string(),
  issued_at: z.number(),
  kind: z.string(),
  key_id: z.string(),
  provenance: Provenance,
  entropy_bits: z.number().nullable(),
  commitment: z.string().nullable(),
  result: z.unknown(),
  details: z.record(z.string(), z.unknown()),
  evidence: z.record(z.string(), z.string()).optional(),
});
export type ReceiptPayload = z.infer<typeof ReceiptPayload>;

export const Receipt = z.looseObject({
  payload: ReceiptPayload,
  signatures: z.record(z.string(), z.string()),
  algorithms: z.array(z.string()).optional(),
});
export type Receipt = z.infer<typeof Receipt>;

const withReceipt = { receipt: Receipt.optional(), receipt_salt: z.string().optional() };

export const PasswordResponse = z.object({ password: z.string(), length: z.number(), entropy_bits: z.number(),
                                           provenance: Provenance, ...withReceipt });
export const PassphraseResponse = z.object({ passphrase: z.string(), words: z.number(), entropy_bits: z.number(),
                                             provenance: Provenance, ...withReceipt });
export const RandomResponse = z.object({ hex: z.string(), bytes: z.number(), provenance: Provenance, ...withReceipt });

export const ProviderStatus = z.looseObject({
  name: z.string(),
  quantum: z.boolean(),
  configured: z.boolean(),
  available: z.boolean(),
  state: z.string().optional(),
  mode: z.enum(["hardware", "simulator"]).optional(),
  pool_bytes: z.number().optional(),
  last_success_at: z.number().nullable().optional(),
  last_harvest_at: z.number().nullable().optional(),
  jobs_last_24h: z.number().optional(),
  error: z.boolean().optional(),
});
export type ProviderStatus = z.infer<typeof ProviderStatus>;

export const EntropyStatus = z.looseObject({
  quantum_available: z.boolean(),
  fallback: z.string(),
  providers: z.array(ProviderStatus),
  checked_at: z.number().optional(),
});
export type EntropyStatus = z.infer<typeof EntropyStatus>;

export const PublicConfig = z.looseObject({
  version: z.string(),
  assistant_enabled: z.boolean(),
  auth_enabled: z.boolean(),
  assistant_requires_sign_in: z.boolean(),
});
export type PublicConfig = z.infer<typeof PublicConfig>;

export const PublicKey = z.object({ key_id: z.string(), ed25519: z.string(), "ml-dsa-65": z.string(),
                                    status: z.string().optional(), revoked_at: z.number().optional() });
export const KeySet = z.object({ algorithms: z.array(z.string()).optional(), keys: z.array(PublicKey) });
export type KeySet = z.infer<typeof KeySet>;

const Verdict = z.looseObject({ valid: z.boolean().optional(), reason: z.string().nullable().optional(),
                                note: z.string().optional() });
export const VerifyResult = z.looseObject({
  valid: z.boolean(),
  reason: z.string().nullable(),
  schema_valid: z.boolean().optional(),
  schema_error: z.string().nullable().optional(),
  version_supported: z.boolean().optional(),
  signatures: z.record(z.string(), z.boolean()),
  key_status: z.string().nullable().optional(),
  key_id_matches: z.boolean().optional(),
  in_public_log: z.boolean().optional(),
  integrity: Verdict.optional(),
  provenance: z.looseObject({ type: z.string().optional(), sources: z.array(z.string()).optional(),
                              quantum: z.boolean().optional(), simulator: z.boolean().optional(),
                              ibm_jobs: z.array(z.unknown()).optional(), health: z.record(z.string(), z.string()).optional(),
                              note: z.string().optional() }).optional(),
  quantum_evidence: z.looseObject({ available: z.boolean(), note: z.string().optional() }).optional(),
  commitment_matches: z.boolean().optional(),
  entries_match: z.boolean().optional(),
  selection_recomputed: z.boolean().nullable().optional(),
  draw: z.looseObject({
    draw_id: z.string(),
    status: z.string(),
    commit_receipt_id: z.string().nullable().optional(),
    result_receipt_id: z.string().nullable().optional(),
    draws_by_same_owner_over_same_entries: z.number(),
    draws_by_anyone_over_same_entries: z.number(),
    committed_seconds_before_run: z.number().nullable().optional(),
  }).optional(),
  payload: z.unknown(),
});
export type VerifyResult = z.infer<typeof VerifyResult>;

export const DrawCommitResponse = z.object({ draw_id: z.string(), commit_receipt: Receipt, commit_url: z.string() });
export type DrawCommitResponse = z.infer<typeof DrawCommitResponse>;
export const DrawRunResponse = z.looseObject({
  winners: z.array(z.object({ index: z.number(), entry: z.string() })),
  receipt: Receipt,
  verify_url: z.string(),
  replayed: z.boolean().optional(),
});
export type DrawRunResponse = z.infer<typeof DrawRunResponse>;

export const Me = z.looseObject({
  id: z.string(),
  email: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  is_admin: z.boolean(),
  stats: z.looseObject({ counts: z.record(z.string(), z.number()), total: z.number(), quantum: z.number() }).optional(),
});
export type Me = z.infer<typeof Me>;

export const MeReceipts = z.object({
  items: z.array(z.looseObject({ receipt_id: z.string(), kind: z.string(), created_at: z.string(), version: z.string(),
                                 sources: z.array(z.string()), quantum: z.boolean(), entropy_bits: z.number().nullable(),
                                 key_id: z.string() })),
  next_before: z.string().nullable(),
});
export type MeReceipts = z.infer<typeof MeReceipts>;

export const MeUsage = z.looseObject({
  today: z.record(z.string(), z.number()),
  month: z.record(z.string(), z.number()),
  draws_today: z.number(),
  assistant_spend_today_usd: z.number(),
  assistant_spend_month_usd: z.number(),
  quotas: z.looseObject({ draws_per_day: z.number(), assistant_messages_per_day: z.number(),
                          assistant_budget_per_day_usd: z.number(), ibm_seeds_per_day: z.number(),
                          rate_limit: z.string() }),
});
export type MeUsage = z.infer<typeof MeUsage>;

export const AdminStats = z.looseObject({
  users: z.number(),
  events: z.record(z.string(), z.number()),
  total_events: z.number(),
  quantum_share: z.number(),
  assistant_cost_usd: z.number(),
  assistant_cost_today_usd: z.number(),
  daily: z.array(z.object({ date: z.string(), count: z.number() })),
  recent_users: z.array(z.looseObject({ id: z.string(), email: z.string().nullable(), name: z.string().nullable(),
                                        last_seen: z.string() })),
  draws_needing_investigation: z.array(z.string()),
  entropy: z.looseObject({ providers: z.array(z.looseObject({ name: z.string() })) }).optional(),
});
export type AdminStats = z.infer<typeof AdminStats>;

export const AuditEvent = z.object({ seq: z.number(), ts: z.string(), actor: z.string(), action: z.string(),
                                     target: z.string().nullable(), details: z.record(z.string(), z.unknown()),
                                     prev_hash: z.string(), hash: z.string() });
export type AuditEvent = z.infer<typeof AuditEvent>;
export const AuditList = z.object({ events: z.array(AuditEvent) });
export const AuditVerify = z.object({ ok: z.boolean(), events: z.number(), first_bad_seq: z.number().nullable(),
                                      head: z.string() });
export type AuditVerify = z.infer<typeof AuditVerify>;
export const Investigations = z.object({
  draws: z.array(z.looseObject({ draw_id: z.string(), owner_id: z.string().nullable(), title: z.string(),
                                 entries_count: z.number(), winners: z.number(), commit_receipt_id: z.string(),
                                 created_at: z.string(), run_started_at: z.string().nullable(),
                                 seed_provenance: z.record(z.string(), z.unknown()).nullable() })),
});
export type Investigations = z.infer<typeof Investigations>;
