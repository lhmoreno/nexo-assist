import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["employee", "analyst"] }).notNull(),
});
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  status: text("status", { enum: ["agent", "waiting", "analyst", "closed"] })
    .notNull()
    .default("agent"),
  analystId: text("analyst_id"),
  draft: text("draft"),
  messageCount: integer("message_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id),
  sender: text("sender", {
    enum: ["employee", "agent", "analyst", "system"],
  }).notNull(),
  body: text("body").notNull(),
  trace: text("trace"),
  createdAt: integer("created_at").notNull(),
});
export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  type: text("type", { enum: ["INC", "REQ"] }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  impact: text("impact").notNull(),
  urgency: text("urgency").notNull(),
  priority: text("priority").notNull(),
  status: text("status").notNull(),
  dueAt: integer("due_at").notNull(),
  resolvedAt: integer("resolved_at"),
  updatedAt: integer("updated_at").notNull(),
  createdAt: integer("created_at").notNull(),
  idempotencyKey: text("idempotency_key").unique(),
});
export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  keywords: text("keywords").notNull(),
});
