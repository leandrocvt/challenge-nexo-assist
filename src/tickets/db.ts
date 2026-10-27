import { mkdirSync } from "node:fs";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  level TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  applies_when TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES employees(id),
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  subject_detail TEXT,
  impact TEXT NOT NULL,
  urgency TEXT NOT NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  sla_due_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  idempotency_key TEXT UNIQUE,
  conversation_id TEXT
);

CREATE TABLE IF NOT EXISTS operations (
  idempotency_key TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS tickets_owner_idx ON tickets(owner_id);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  state TEXT NOT NULL,
  analyst_id TEXT REFERENCES employees(id),
  active_session_id TEXT,
  transfer_summary TEXT,
  transfer_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS conversations_employee_idx ON conversations(employee_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  message_count INTEGER NOT NULL,
  summary_of_previous TEXT,
  opened_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  counts_toward_limit INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS drafts (
  id TEXT PRIMARY KEY,
  public_code TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  operation TEXT NOT NULL,
  payload TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  ticket_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decision_traces (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  intent TEXT NOT NULL,
  evidence TEXT NOT NULL,
  cited_rule TEXT NOT NULL,
  applied_rule TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  taken_action TEXT NOT NULL,
  confidence TEXT NOT NULL,
  priority TEXT,
  sla_due_at TEXT,
  policy_refused INTEGER NOT NULL,
  transfer_reason TEXT,
  created_at TEXT NOT NULL
);
`;

export function databaseFile(root = process.cwd()): string {
  return path.join(root, "data", "nexo.db");
}

export function openDatabase(filePath: string): Client {
  if (filePath === ":memory:") {
    return createClient({ url: ":memory:" });
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const urlPath = filePath.replaceAll("\\", "/");
  return createClient({ url: `file:${urlPath}` });
}

export async function migrate(client: Client): Promise<void> {
  await client.executeMultiple(SCHEMA);
}
