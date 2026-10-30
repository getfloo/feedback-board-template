import { type AnyPgColumn, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const STATUSES = ["new", "planned", "in_progress", "shipped", "declined"] as const;
export type Status = (typeof STATUSES)[number];

export const SOURCES = ["sales_call", "support_ticket", "user_interview", "internal", "other"] as const;
export type Source = (typeof SOURCES)[number];

/** People who have signed in, synced from the gateway on every page load. */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// author_id is whatever id the gateway asserted: a user's id from a page, or an
// API consumer's id from /api. It is not a foreign key to users because a key
// caller is not a user, so the display name is stored alongside it.
export const items = pgTable("items", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  source: text("source").$type<Source>().notNull(),
  customer: text("customer"),
  tags: text("tags").array().notNull().default([]),
  status: text("status").$type<Status>().notNull().default("new"),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  // Set when an admin merges this item into another; the board hides merged items
  // and the item page redirects to the kept one.
  mergedIntoId: uuid("merged_into_id").references((): AnyPgColumn => items.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("items_merged_into_id_idx").on(table.mergedIntoId)]);

/** One vote per signed-in user per item; voting again removes it. */
export const votes = pgTable("votes", {
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.itemId, table.userId] }),
  index("votes_user_id_idx").on(table.userId),
]);

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("comments_item_id_created_at_idx").on(table.itemId, table.createdAt)]);
