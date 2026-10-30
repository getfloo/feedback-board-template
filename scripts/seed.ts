// Fills an empty board with sample feedback so you can see how it works.
// Run it against your dev database: floo run --service web -- npm run seed
// It never runs on deploy, and it does nothing if the board already has items.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { type Source, type Status, comments, items, votes } from "../db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("Missing DATABASE_URL. Run this through floo run --service web -- npm run seed.");
}

type Sample = {
  title: string;
  description: string;
  source: Source;
  customer?: string;
  tags: string[];
  status: Status;
  author: string;
  voters: number;
  comments?: [string, string][];
};

const SAMPLES: Sample[] = [
  {
    title: "Export reports to CSV",
    description: "Finance at Northwind copies the monthly usage report into a spreadsheet by hand. They want a download button on every report.",
    source: "support_ticket", customer: "Northwind Logistics", tags: ["export", "reporting"], status: "planned", author: "Maya Chen", voters: 7,
    comments: [
      ["Jordan Ellis", "Came up again on the Cedar Ridge renewal call. They would use it weekly."],
      ["Maya Chen", "Scoped for next cycle. Starting with the usage and invoice reports."],
    ],
  },
  {
    title: "SAML single sign-on",
    description: "Their security review requires SSO through their identity provider before they can roll out past the pilot team.",
    source: "sales_call", customer: "Brightline Health", tags: ["security", "enterprise"], status: "in_progress", author: "Jordan Ellis", voters: 6,
    comments: [["Sam Okafor", "Blocking a 40-seat expansion. Target is end of quarter."]],
  },
  {
    title: "Bulk edit invoice due dates",
    description: "Changing payment terms means opening 30+ invoices one at a time. Select many and set a new due date.",
    source: "user_interview", customer: "Harbor & Pine", tags: ["billing"], status: "new", author: "Priya Raman", voters: 4,
  },
  {
    title: "Custom fields on customer records",
    description: "They track contract tier and account manager outside the app today. Two or three free-form fields would cover it.",
    source: "sales_call", customer: "Cedar Ridge Dental", tags: ["customization"], status: "planned", author: "Jordan Ellis", voters: 4,
  },
  {
    title: "Faster search on large accounts",
    description: "Search takes several seconds for accounts with more than 50k orders. Support sees this weekly.",
    source: "support_ticket", customer: "Northwind Logistics", tags: ["performance"], status: "in_progress", author: "Sam Okafor", voters: 3,
  },
  {
    title: "Mobile-friendly order page",
    description: "Drivers open order links on their phones and have to pinch and zoom.",
    source: "user_interview", tags: ["mobile"], status: "shipped", author: "Priya Raman", voters: 5,
    comments: [["Maya Chen", "Shipped in the March release. Let the drivers' manager know."]],
  },
  {
    title: "Audit log for admin changes",
    description: "Compliance wants to see who changed user roles and when.",
    source: "sales_call", customer: "Brightline Health", tags: ["security", "enterprise"], status: "new", author: "Jordan Ellis", voters: 2,
  },
  {
    title: "Weekly email digest of account activity",
    description: "Account managers want a Monday summary of what changed across their customers.",
    source: "internal", tags: ["notifications"], status: "new", author: "Sam Okafor", voters: 1,
  },
  {
    title: "Offline mode for field staff",
    description: "Warehouse staff lose signal in the back of the building and lose unsaved scans.",
    source: "user_interview", customer: "Harbor & Pine", tags: ["mobile"], status: "declined", author: "Priya Raman", voters: 1,
    comments: [["Maya Chen", "Not this year: autosave on reconnect covers most of the pain. Revisit if more customers ask."]],
  },
  {
    // A duplicate of the first item, so an admin can try Merge duplicate on its page.
    title: "Download usage report as a spreadsheet",
    description: "Wants to pull the usage report into their own budgeting sheet every month.",
    source: "support_ticket", customer: "Maple Street Bakery", tags: ["export"], status: "new", author: "Sam Okafor", voters: 2,
  },
];

const client = postgres(url, { max: 1 });
const db = drizzle(client);
try {
  const existing = await db.select({ id: items.id }).from(items).limit(1);
  if (existing.length > 0) {
    console.log("The board already has items; the seed only fills an empty board.");
  } else {
    await db.transaction(async (tx) => {
      for (const [index, sample] of SAMPLES.entries()) {
        const author = `seed-${sample.author.toLowerCase().replace(/\W+/g, "-")}`;
        // Spread creation dates over the last few weeks so the board reads naturally.
        const createdAt = new Date(Date.now() - (SAMPLES.length - index) * 2 * 86_400_000);
        const [item] = await tx.insert(items).values({
          title: sample.title, description: sample.description, source: sample.source,
          customer: sample.customer ?? null, tags: sample.tags, status: sample.status,
          authorId: author, authorName: sample.author, createdAt,
        }).returning();
        if (sample.voters > 0) {
          await tx.insert(votes).values(Array.from({ length: sample.voters }, (_, voter) => ({ itemId: item.id, userId: `seed-voter-${voter + 1}` })));
        }
        for (const [hour, [name, body]] of (sample.comments ?? []).entries()) {
          await tx.insert(comments).values({
            itemId: item.id, authorId: `seed-${name.toLowerCase().replace(/\W+/g, "-")}`, authorName: name, body,
            createdAt: new Date(createdAt.getTime() + (hour + 1) * 3_600_000 * 20),
          });
        }
      }
    });
    console.log(`Seeded ${SAMPLES.length} feedback items.`);
  }
} finally {
  await client.end();
}
