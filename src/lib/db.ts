import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

/**
 * DATABASE_URL aceita um caminho de arquivo (`./data/nexo.sqlite`), `file:...`
 * ou uma URL libSQL remota (`libsql://...` do Turso, com DATABASE_AUTH_TOKEN).
 * O mesmo código roda localmente e em produção.
 */
const raw = process.env.DATABASE_URL || "./data/nexo.sqlite";
const remote = /^(libsql|https?|wss?):/.test(raw);
const url = remote || raw.startsWith("file:") ? raw : `file:${raw}`;
if (!remote)
  fs.mkdirSync(path.dirname(url.replace(/^file:/, "")), { recursive: true });
const base: Client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
});
const ddl = `CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS analyst_presence(user_id TEXT PRIMARY KEY REFERENCES users(id),last_seen_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL,analyst_id TEXT,draft TEXT,message_count INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),sender TEXT NOT NULL,body TEXT NOT NULL,trace TEXT,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,category TEXT NOT NULL,impact TEXT NOT NULL,urgency TEXT NOT NULL,priority TEXT NOT NULL,status TEXT NOT NULL,due_at INTEGER NOT NULL,resolved_at INTEGER,updated_at INTEGER NOT NULL,created_at INTEGER NOT NULL,idempotency_key TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS ticket_operations(key TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),ticket_id TEXT NOT NULL REFERENCES tickets(id),duplicate INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS articles(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,keywords TEXT NOT NULL);`;
// As tabelas são criadas uma vez, antes da primeira consulta. O proxy faz toda
// operação esperar essa inicialização, então nenhum chamador precisa lembrar dela.
let ready: Promise<unknown> | null = null;
const init = () =>
  (ready ??= base
    .executeMultiple(
      (remote ? "" : "PRAGMA journal_mode = DELETE;\n") +
        "PRAGMA foreign_keys = ON;\n" +
        ddl,
    )
    .catch((e) => {
      ready = null;
      throw e;
    }));
const gated = new Set(["execute", "batch", "transaction"]);
export const client: Client = new Proxy(base, {
  get(target, prop) {
    const value = Reflect.get(target, prop, target);
    if (typeof value !== "function") return value;
    return gated.has(String(prop))
      ? async (...args: unknown[]) => {
          await init();
          return value.apply(target, args);
        }
      : value.bind(target);
  },
});
export const db = drizzle(client, { schema });
