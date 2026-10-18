export interface Provenance {
  sources: string[];
  quantum: boolean;
  quantum_bytes: number;
  mixed_with: string;
  failures: Record<string, string>;
  timestamp: number;
}

export interface PasswordResult {
  password: string;
  length: number;
  entropy_bits: number;
  provenance: Provenance;
}

export interface PassphraseResult {
  passphrase: string;
  words: number;
  entropy_bits: number;
  provenance: Provenance;
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
