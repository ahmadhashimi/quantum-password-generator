export interface Provenance {
  sources: string[];
  quantum: boolean;
  quantum_bytes: number;
  mixed_with: string;
  failures: Record<string, string>;
  timestamp: number;
}

export interface ReceiptPayload {
  version: string;
  receipt_id: string;
  issued_at: number;
  kind: "password" | "passphrase" | "random" | "draw";
  key_id: string;
  provenance: Pick<Provenance, "sources" | "quantum" | "quantum_bytes" | "mixed_with"> & {
    ibm_job?: { backend: string; job_id: string; mode: string };
    health?: Record<string, string>;
  };
  entropy_bits: number | null;
  commitment: string | null;
  result: DrawResult | null;
  details: Record<string, unknown>;
}

export interface Receipt {
  payload: ReceiptPayload;
  signatures: Record<string, string>;
  algorithms?: string[];
}

export interface DrawResult {
  title: string;
  entries_count: number;
  entries_sha256: string;
  winners: { index: number; entry: string }[];
}

export interface VerifyResult {
  valid: boolean;
  signatures: Record<string, boolean>;
  key_id_matches: boolean;
  in_public_log: boolean;
  payload: ReceiptPayload;
  commitment_matches?: boolean;
  entries_match?: boolean;
}

export interface PasswordResult {
  password: string;
  length: number;
  entropy_bits: number;
  provenance: Provenance;
  receipt?: Receipt;
  receipt_salt?: string;
}

export interface PassphraseResult {
  passphrase: string;
  words: number;
  entropy_bits: number;
  provenance: Provenance;
  receipt?: Receipt;
  receipt_salt?: string;
}

export interface ProviderStatus {
  name: string;
  quantum: boolean;
  configured: boolean;
  available: boolean;
  last_error: string | null;
  pool_bytes?: number;
  last_backend?: string | null;
  jobs_last_24h?: number;
}

export interface EntropyStatus {
  quantum_available: boolean;
  fallback: string;
  providers: ProviderStatus[];
}

export interface PublicConfig {
  version: string;
  assistant_enabled: boolean;
  auth_enabled: boolean;
  assistant_requires_sign_in: boolean;
}

export interface Me {
  id: string;
  email: string | null;
  name: string | null;
  is_admin: boolean;
  stats: { counts: Record<string, number>; total: number; quantum: number };
}

export interface AdminStats {
  users: number;
  events: Record<string, number>;
  total_events: number;
  quantum_share: number;
  assistant_cost_usd: number;
  assistant_cost_today_usd: number;
  daily: { date: string; count: number }[];
  recent_users: { id: string; email: string | null; name: string | null; last_seen: string }[];
}

export interface Secret {
  secret_id: string;
  kind: "password" | "passphrase";
  value: string;
  entropy_bits: number;
  provenance: Provenance;
}

export type ChatEvent =
  | { event: "conversation"; data: { id: string } }
  | { event: "text"; data: { text: string } }
  | { event: "tool"; data: { name: string } }
  | { event: "secret"; data: Secret }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: Record<string, never> };
