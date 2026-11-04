import { z } from "zod";
import { CommentInput, ItemInput, ListFilters, SOURCES, StatusInput, StatusSchema } from "@/lib/feedback";
import { ApiError, type Operation } from "@/lib/openapi";

/** A feedback item as the API returns it. */
export const ItemJson = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  source: z.enum(SOURCES),
  customer: z.string().nullable(),
  tags: z.array(z.string()),
  status: StatusSchema,
  authorId: z.string().meta({ description: "The user or API consumer that filed the item." }),
  authorName: z.string(),
  mergedIntoId: z.uuid().nullable().meta({ description: "Set when an admin merged this item into another one." }),
  votes: z.int().min(0),
  comments: z.int().min(0),
  createdAt: z.iso.datetime(),
});

export const CommentJson = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  authorId: z.string(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});

const ItemPath = z.object({ id: z.uuid().meta({ description: "The item id." }) });
const notFound = { description: "No item has this id.", schema: ApiError };
const merged = { description: "The item was merged into another; act on that one instead.", schema: ApiError };

// The contract for the routes in this folder. Listed in app/api/operations.ts; the
// tests fail if a handler is missing here or a response stops matching.
export const operations: Operation[] = [
  {
    method: "get",
    path: "/api/items",
    operationId: "listItems",
    summary: "List open feedback items, most votes first. Merged duplicates are left out.",
    query: ListFilters,
    responses: {
      200: { description: "The matching items.", schema: z.object({ items: z.array(ItemJson) }) },
      400: { description: "A filter value is not valid.", schema: ApiError },
    },
  },
  {
    method: "post",
    path: "/api/items",
    operationId: "createItem",
    summary: "File a feedback item, for example from a support ticket. It starts with status new.",
    request: ItemInput,
    responses: {
      201: { description: "The created item.", schema: z.object({ item: ItemJson }) },
      400: { description: "The body is not JSON or a field is missing or invalid.", schema: ApiError },
    },
  },
  {
    method: "get",
    path: "/api/items/{id}",
    operationId: "getItem",
    summary: "Read one item and its comments, oldest first.",
    pathParams: ItemPath,
    responses: {
      200: { description: "The item and its comments.", schema: z.object({ item: ItemJson, comments: z.array(CommentJson) }) },
      404: notFound,
    },
  },
  {
    method: "patch",
    path: "/api/items/{id}",
    operationId: "updateItemStatus",
    summary: "Change an item's status.",
    pathParams: ItemPath,
    request: StatusInput,
    responses: {
      200: { description: "The updated item.", schema: z.object({ item: ItemJson }) },
      400: { description: "The body is not JSON or the status is not valid.", schema: ApiError },
      403: { description: "A member's own floo key; only app admins change status.", schema: ApiError },
      404: notFound,
      409: merged,
    },
  },
  {
    method: "post",
    path: "/api/items/{id}/comments",
    operationId: "addComment",
    summary: "Comment on an item as the API consumer.",
    pathParams: ItemPath,
    request: CommentInput,
    responses: {
      201: { description: "The created comment.", schema: z.object({ comment: CommentJson }) },
      400: { description: "The body is not JSON or the comment is empty or too long.", schema: ApiError },
      404: notFound,
      409: merged,
    },
  },
];
