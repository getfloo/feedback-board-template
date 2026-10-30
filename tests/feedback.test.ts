import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("tests never open a database"); } }));

import { ItemInput, authorOf, parse, requireAdmin, splitTags } from "../lib/feedback";

const user = { kind: "user" as const, id: "user-1", email: "pat@example.com", name: "Pat", role: "member" };

describe("submit form input", () => {
  it("splits the comma-separated tags field and drops empty entries", () => {
    expect(splitTags(" export, Billing ,, ")).toEqual(["export", "Billing"]);
  });

  it("normalizes tags and fills optional fields", () => {
    expect(parse(ItemInput, { title: "Bulk edit invoices", source: "user_interview", tags: ["Billing"] })).toEqual({
      title: "Bulk edit invoices", description: "", source: "user_interview", tags: ["billing"],
    });
  });

  it("rejects more tags than the board allows", () => {
    const tags = Array.from({ length: 11 }, (_, index) => `tag-${index}`);
    expect(() => parse(ItemInput, { title: "Too many tags", source: "other", tags })).toThrow("Use at most 10 tags.");
  });
});

describe("permissions", () => {
  it("lets admins change status and merge", () => {
    expect(() => requireAdmin({ ...user, role: "admin" })).not.toThrow();
  });

  it.each(["member", "viewer", ""])("refuses the role %j", (role) => {
    expect(() => requireAdmin({ ...user, role })).toThrow("Only app admins");
  });
});

describe("authors", () => {
  it("names a user by display name, then email", () => {
    expect(authorOf(user)).toEqual({ id: "user-1", name: "Pat" });
    expect(authorOf({ ...user, name: "" })).toEqual({ id: "user-1", name: "pat@example.com" });
  });

  it("names an API key by its consumer", () => {
    const key = { kind: "api_key" as const, id: "consumer-9", name: "support-agent", keyId: "key-42", scopes: ["api"] };
    expect(authorOf(key)).toEqual({ id: "consumer-9", name: "support-agent" });
    expect(authorOf({ ...key, name: "" })).toEqual({ id: "consumer-9", name: "API key" });
  });
});
