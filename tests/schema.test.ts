import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";

describe("committed migration", () => {
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
  const sql = migrations.flatMap((migration) => migration.sql).join("\n");
  const tables = new Map(Array.from(
    sql.matchAll(/CREATE TABLE "(\w+)"\s*\(([\s\S]*?)\n\);/g),
    ([, name, columns]) => [name, columns],
  ));

  it("creates users with the gateway ID and profile fields", () => {
    expect(tables.get("users")).toMatch(/"id" text PRIMARY KEY NOT NULL/);
    for (const column of ["email", "name", "role", "created_at", "updated_at"]) {
      expect(tables.get("users")).toContain(`"${column}"`);
    }
  });

  it("creates items authored by a gateway principal, user or API consumer, without a users foreign key", () => {
    const items = tables.get("items");
    expect(items).toMatch(/"id" uuid PRIMARY KEY DEFAULT gen_random_uuid\(\) NOT NULL/);
    expect(items).toContain('"author_id" text NOT NULL');
    expect(items).toContain('"author_name" text NOT NULL');
    expect(items).toContain(`"tags" text[] DEFAULT '{}' NOT NULL`);
    expect(items).toContain(`"status" text DEFAULT 'new' NOT NULL`);
    expect(items).toContain('"merged_into_id" uuid,');
    expect(sql).not.toMatch(/REFERENCES "users"/);
  });

  it("allows one vote per user per item", () => {
    expect(tables.get("votes")).toContain('PRIMARY KEY("item_id","user_id")');
  });

  it("removes votes and comments with their item", () => {
    for (const table of ["votes", "comments"]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE "${table}" ADD CONSTRAINT .* FOREIGN KEY \\("item_id"\\) REFERENCES "items"\\("id"\\) ON DELETE cascade`));
    }
  });

  it("keeps SQL portable across managed tenant schemas", () => {
    expect(sql).not.toMatch(/"public"\.|CREATE SCHEMA|SET search_path/i);
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    expect(journal.entries).toHaveLength(migrations.length);
    expect(migrations.length).toBeGreaterThan(0);
  });
});
