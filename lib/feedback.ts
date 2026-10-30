import "server-only";
import { and, arrayContains, asc, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { SOURCES, STATUSES, type Source, type Status, comments, items, votes } from "@/db/schema";
import type { Caller, User } from "@/lib/identity";

export { SOURCES, STATUSES, type Source, type Status };

export const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  declined: "Declined",
};

export const SOURCE_LABELS: Record<Source, string> = {
  sales_call: "Sales call",
  support_ticket: "Support ticket",
  user_interview: "User interview",
  internal: "Internal",
  other: "Other",
};

export const MAX_TITLE_LENGTH = 140;
export const MAX_TEXT_LENGTH = 5000;
export const MAX_TAGS = 10;

// Errors the caller can fix. The API answers each with its status; pages map
// NotFound to a 404 page.
export class FeedbackError extends Error {
  status = 400;
}
export class NotFound extends FeedbackError {
  status = 404;
}
export class Conflict extends FeedbackError {
  status = 409;
}

export const StatusSchema = z.enum(STATUSES, { error: `Use one of: ${STATUSES.join(", ")}.` });

const Tag = z.string().trim().toLowerCase().min(1).max(32, { error: "Keep each tag under 32 characters." });

// One schema per write validates the form action and the API, and the OpenAPI
// document is generated from it, so the three cannot drift.
export const ItemInput = z.object({
  title: z.string({ error: "Give the item a title." })
    .trim()
    .min(3, { error: "Give the item a title of at least 3 characters." })
    .max(MAX_TITLE_LENGTH, { error: `Keep the title under ${MAX_TITLE_LENGTH} characters.` }),
  description: z.string().trim().max(MAX_TEXT_LENGTH, { error: "Keep the description under 5,000 characters." })
    .default("")
    .meta({ description: "What the customer asked for and why, in their words if you have them." }),
  source: z.enum(SOURCES, { error: `Set source to one of: ${SOURCES.join(", ")}.` })
    .meta({ description: "Where the feedback came from." }),
  customer: z.string().trim().max(120, { error: "Keep the customer name under 120 characters." })
    .optional()
    .meta({ description: "The customer or account that asked, if any." }),
  tags: z.array(Tag).max(MAX_TAGS, { error: `Use at most ${MAX_TAGS} tags.` })
    .default([])
    .meta({ description: "Lowercase labels such as export or billing." }),
});

export const CommentInput = z.object({
  body: z.string({ error: "Write a comment." })
    .trim()
    .min(1, { error: "Write a comment." })
    .max(MAX_TEXT_LENGTH, { error: "Keep the comment under 5,000 characters." }),
});

export const StatusInput = z.object({ status: StatusSchema });

export const ListFilters = z.object({
  status: StatusSchema.optional(),
  tag: Tag.optional().meta({ description: "Only items carrying this tag." }),
});

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new FeedbackError(parsed.error.issues[0].message);
  }
  return parsed.data;
}

/** The form's comma-separated tags field as the list ItemInput expects. */
export function splitTags(text: string): string[] {
  return text.split(",").map((tag) => tag.trim()).filter(Boolean);
}

/** Changing status and merging are admin-only; the gateway asserts the role. */
export function requireAdmin(user: User): void {
  if (user.role !== "admin") {
    throw new Error("Only app admins can change status or merge items.");
  }
}

export type Author = { id: string; name: string };

export function authorOf(caller: Caller): Author {
  if (caller.kind === "api_key") {
    return { id: caller.id, name: caller.name || "API key" };
  }
  return { id: caller.id, name: caller.name || caller.email };
}

// Correlated count subqueries. drizzle's $count qualifies the outer items.id,
// which a hand-written sql`` fragment in a select list would not.
const voteCount = () => getDb().$count(votes, eq(votes.itemId, items.id));
const commentCount = () => getDb().$count(comments, eq(comments.itemId, items.id));

function selectItems() {
  return getDb().select({ ...getTableColumns(items), votes: voteCount(), comments: commentCount() }).from(items);
}

export type Item = Awaited<ReturnType<typeof selectItems>>[number];
export type Comment = typeof comments.$inferSelect;

/** Open (not merged) items, most votes first. */
export async function listItems(filters: z.infer<typeof ListFilters> = {}): Promise<Item[]> {
  return selectItems()
    .where(and(
      isNull(items.mergedIntoId),
      filters.status && eq(items.status, filters.status),
      filters.tag ? arrayContains(items.tags, [filters.tag]) : undefined,
    ))
    .orderBy(desc(voteCount()), desc(items.createdAt));
}

/** Status counts and tags in use across open items, for the board's filters. */
export async function boardFacets(): Promise<{ counts: Record<Status, number>; tags: string[] }> {
  const rows = await getDb().select({ status: items.status, tags: items.tags }).from(items)
    .where(isNull(items.mergedIntoId));
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>;
  for (const row of rows) counts[row.status] += 1;
  const tags = [...new Set(rows.flatMap((row) => row.tags))].sort();
  return { counts, tags };
}

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Any item, merged or not; null when the id does not exist. */
export async function getItem(id: string): Promise<Item | null> {
  if (!isUuid(id)) return null;
  const [item] = await selectItems().where(eq(items.id, id));
  return item ?? null;
}

async function requireOpenItem(id: string): Promise<Item> {
  const item = await getItem(id);
  if (!item) throw new NotFound("Item not found.");
  if (item.mergedIntoId) throw new Conflict(`This item was merged into ${item.mergedIntoId}.`);
  return item;
}

export async function listComments(itemId: string): Promise<Comment[]> {
  return getDb().select().from(comments).where(eq(comments.itemId, itemId)).orderBy(asc(comments.createdAt));
}

/** Ids of the items this user has voted for. */
export async function votedItemIds(userId: string): Promise<Set<string>> {
  const rows = await getDb().select({ itemId: votes.itemId }).from(votes).where(eq(votes.userId, userId));
  return new Set(rows.map((row) => row.itemId));
}

export async function createItem(author: Author, input: z.infer<typeof ItemInput>): Promise<Item> {
  const [item] = await getDb().insert(items).values({
    title: input.title,
    description: input.description,
    source: input.source,
    customer: input.customer || null,
    tags: [...new Set(input.tags)],
    authorId: author.id,
    authorName: author.name,
  }).returning();
  return { ...item, votes: 0, comments: 0 };
}

/** Adds the user's vote, or removes it if they already voted. */
export async function toggleVote(itemId: string, userId: string): Promise<void> {
  await requireOpenItem(itemId);
  const db = getDb();
  const removed = await db.delete(votes)
    .where(and(eq(votes.itemId, itemId), eq(votes.userId, userId)))
    .returning();
  if (removed.length === 0) {
    await db.insert(votes).values({ itemId, userId }).onConflictDoNothing();
  }
}

export async function addComment(itemId: string, author: Author, body: string): Promise<Comment> {
  await requireOpenItem(itemId);
  const [comment] = await getDb().insert(comments)
    .values({ itemId, authorId: author.id, authorName: author.name, body })
    .returning();
  return comment;
}

export async function setStatus(itemId: string, status: Status): Promise<Item> {
  const item = await requireOpenItem(itemId);
  await getDb().update(items).set({ status }).where(eq(items.id, itemId));
  return { ...item, status };
}

/**
 * Folds a duplicate into the item being kept, in one transaction: comments move,
 * votes move (a person who voted for both keeps one vote), tags are combined, and
 * the duplicate is marked merged so links to it lead to the kept item.
 */
export async function mergeItems(duplicateId: string, keptId: string, author: Author): Promise<void> {
  if (duplicateId === keptId) throw new Conflict("Pick a different item to merge into.");
  if (!isUuid(duplicateId) || !isUuid(keptId)) throw new NotFound("Item not found.");

  await getDb().transaction(async (tx) => {
    const rows = await tx.select().from(items).where(inArray(items.id, [duplicateId, keptId])).for("update");
    const duplicate = rows.find((row) => row.id === duplicateId);
    const kept = rows.find((row) => row.id === keptId);
    if (!duplicate || !kept) throw new NotFound("Item not found.");
    if (duplicate.mergedIntoId || kept.mergedIntoId) throw new Conflict("One of these items was already merged.");

    await tx.execute(sql`
      insert into ${votes} ("item_id", "user_id", "created_at")
      select ${keptId}::uuid, ${votes.userId}, ${votes.createdAt} from ${votes} where ${votes.itemId} = ${duplicateId}
      on conflict do nothing`);
    await tx.delete(votes).where(eq(votes.itemId, duplicateId));
    await tx.update(comments).set({ itemId: keptId }).where(eq(comments.itemId, duplicateId));
    // Items merged into the duplicate earlier now point at the kept item.
    await tx.update(items).set({ mergedIntoId: keptId }).where(eq(items.mergedIntoId, duplicateId));
    await tx.update(items).set({ mergedIntoId: keptId }).where(eq(items.id, duplicateId));
    await tx.update(items).set({ tags: [...new Set([...kept.tags, ...duplicate.tags])] }).where(eq(items.id, keptId));

    // Keep the duplicate's evidence on the kept item: who asked, from where, and what they said.
    const origin = [SOURCE_LABELS[duplicate.source], duplicate.customer].filter(Boolean).join(", ");
    const body = [`Merged a duplicate: "${duplicate.title}" (${origin}).`, duplicate.description].filter(Boolean).join("\n\n");
    await tx.insert(comments).values({ itemId: keptId, authorId: author.id, authorName: author.name, body });
  });
}
