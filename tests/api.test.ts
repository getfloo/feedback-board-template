import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("tests never open a database"); } }));
vi.mock("@/lib/feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/feedback")>()),
  listItems: vi.fn(),
  createItem: vi.fn(),
  getItem: vi.fn(),
  listComments: vi.fn(),
  setStatus: vi.fn(),
  addComment: vi.fn(),
}));

import { operations } from "../app/api/items/openapi";
import * as itemsRoute from "../app/api/items/route";
import * as itemRoute from "../app/api/items/[id]/route";
import * as commentsRoute from "../app/api/items/[id]/comments/route";
import { Conflict, NotFound, addComment, createItem, getItem, listComments, listItems, setStatus } from "../lib/feedback";

const keyHeaders = {
  "X-Floo-Auth-Method": "api_key",
  "X-Floo-Api-Consumer-Id": "consumer-9",
  "X-Floo-Api-Consumer-Name": "support-agent",
  "X-Floo-Api-Key-Id": "key-42",
  "X-Floo-Api-Key-Scopes": "api",
};

const id = "0b8f3c2e-6a1d-4f5b-9c7e-2d4a6b8c0e1f";
const context = { params: Promise.resolve({ id }) };

const item = {
  id,
  title: "Export invoices to CSV",
  description: "Finance re-keys every invoice into a spreadsheet.",
  source: "support_ticket" as const,
  customer: "Northwind Logistics",
  tags: ["export"],
  status: "new" as const,
  authorId: "consumer-9",
  authorName: "support-agent",
  mergedIntoId: null,
  votes: 3,
  comments: 1,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const comment = {
  id: "5a1c7d3e-2b4f-4e6a-8c9d-0e1f2a3b4c5d",
  itemId: id,
  authorId: "consumer-9",
  authorName: "support-agent",
  body: "Two more tickets asked for this today.",
  createdAt: new Date("2026-01-02T00:00:00Z"),
};

// Every response a handler gives must match what the OpenAPI document declares.
async function expectDocumented(method: string, path: string, response: Response): Promise<unknown> {
  const operation = operations.find((entry) => entry.method === method && entry.path === path);
  const declared = operation?.responses[response.status];
  expect(declared?.schema, `${method.toUpperCase()} ${path} ${response.status} is not documented`).toBeDefined();
  const body: unknown = await response.json();
  declared?.schema?.parse(body);
  return body;
}

const send = (method: string, url: string, body?: BodyInit) =>
  new Request(`http://app${url}`, { method, headers: keyHeaders, body });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/items", () => {
  it("lists items with the filters the caller passed", async () => {
    vi.mocked(listItems).mockResolvedValue([item]);
    const response = await itemsRoute.GET(send("GET", "/api/items?status=new&tag=Export"));
    expect(response.status).toBe(200);
    expect(await expectDocumented("get", "/api/items", response)).toEqual({
      items: [{ ...item, createdAt: item.createdAt.toISOString() }],
    });
    expect(listItems).toHaveBeenCalledWith({ status: "new", tag: "export" });
  });

  it("answers an unknown status with 400", async () => {
    const response = await itemsRoute.GET(send("GET", "/api/items?status=done"));
    expect(response.status).toBe(400);
    expect(await expectDocumented("get", "/api/items", response)).toEqual({
      error: "Use one of: new, planned, in_progress, shipped, declined.",
    });
    expect(listItems).not.toHaveBeenCalled();
  });

  it("refuses a request that did not come through the gateway", async () => {
    await expect(itemsRoute.GET(new Request("http://app/api/items"))).rejects.toThrow("did not come through the floo gateway");
    expect(listItems).not.toHaveBeenCalled();
  });
});

describe("POST /api/items", () => {
  it("files an item authored by the key's consumer, with normalized input", async () => {
    vi.mocked(createItem).mockResolvedValue(item);
    const response = await itemsRoute.POST(send("POST", "/api/items", JSON.stringify({
      title: "  Export invoices to CSV ",
      source: "support_ticket",
      customer: "Northwind Logistics",
      tags: [" Export "],
    })));
    expect(response.status).toBe(201);
    await expectDocumented("post", "/api/items", response);
    expect(createItem).toHaveBeenCalledWith(
      { id: "consumer-9", name: "support-agent" },
      { title: "Export invoices to CSV", description: "", source: "support_ticket", customer: "Northwind Logistics", tags: ["export"] },
    );
  });

  it("answers invalid input with 400 and the same message the form would get", async () => {
    const response = await itemsRoute.POST(send("POST", "/api/items", JSON.stringify({ title: "CSV", source: "email" })));
    expect(response.status).toBe(400);
    expect(await expectDocumented("post", "/api/items", response)).toEqual({
      error: "Set source to one of: sales_call, support_ticket, user_interview, internal, other.",
    });
    expect(createItem).not.toHaveBeenCalled();
  });

  it.each([["not JSON", "not json"], ["JSON that is not an object", '"hello"']])("answers %s with 400", async (_label, body) => {
    const response = await itemsRoute.POST(send("POST", "/api/items", body));
    expect(response.status).toBe(400);
    await expectDocumented("post", "/api/items", response);
    expect(createItem).not.toHaveBeenCalled();
  });
});

describe("GET /api/items/{id}", () => {
  it("returns the item and its comments", async () => {
    vi.mocked(getItem).mockResolvedValue(item);
    vi.mocked(listComments).mockResolvedValue([comment]);
    const response = await itemRoute.GET(send("GET", `/api/items/${id}`), context);
    expect(response.status).toBe(200);
    await expectDocumented("get", "/api/items/{id}", response);
    expect(listComments).toHaveBeenCalledWith(id);
  });

  it("answers an unknown id with 404", async () => {
    vi.mocked(getItem).mockResolvedValue(null);
    const response = await itemRoute.GET(send("GET", `/api/items/${id}`), context);
    expect(response.status).toBe(404);
    await expectDocumented("get", "/api/items/{id}", response);
  });
});

describe("PATCH /api/items/{id}", () => {
  const patch = (body: BodyInit) => itemRoute.PATCH(send("PATCH", `/api/items/${id}`, body), context);

  it("changes the status", async () => {
    vi.mocked(setStatus).mockResolvedValue({ ...item, status: "planned" });
    const response = await patch(JSON.stringify({ status: "planned" }));
    expect(response.status).toBe(200);
    await expectDocumented("patch", "/api/items/{id}", response);
    expect(setStatus).toHaveBeenCalledWith(id, "planned");
  });

  it("answers an unknown status with 400", async () => {
    const response = await patch(JSON.stringify({ status: "done" }));
    expect(response.status).toBe(400);
    await expectDocumented("patch", "/api/items/{id}", response);
    expect(setStatus).not.toHaveBeenCalled();
  });

  it.each([[new NotFound("Item not found."), 404], [new Conflict("This item was merged into another."), 409]])(
    "answers %s with its status",
    async (error, status) => {
      vi.mocked(setStatus).mockRejectedValue(error);
      const response = await patch(JSON.stringify({ status: "shipped" }));
      expect(response.status).toBe(status);
      expect(await expectDocumented("patch", "/api/items/{id}", response)).toEqual({ error: error.message });
    },
  );
});

describe("POST /api/items/{id}/comments", () => {
  const post = (body: BodyInit) => commentsRoute.POST(send("POST", `/api/items/${id}/comments`, body), context);

  it("comments as the key's consumer", async () => {
    vi.mocked(addComment).mockResolvedValue(comment);
    const response = await post(JSON.stringify({ body: " Two more tickets asked for this today. " }));
    expect(response.status).toBe(201);
    await expectDocumented("post", "/api/items/{id}/comments", response);
    expect(addComment).toHaveBeenCalledWith(id, { id: "consumer-9", name: "support-agent" }, "Two more tickets asked for this today.");
  });

  it("answers an empty comment with 400", async () => {
    const response = await post(JSON.stringify({ body: "  " }));
    expect(response.status).toBe(400);
    expect(await expectDocumented("post", "/api/items/{id}/comments", response)).toEqual({ error: "Write a comment." });
    expect(addComment).not.toHaveBeenCalled();
  });
});
