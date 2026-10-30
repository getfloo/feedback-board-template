# Feedback board template for floo

An internal feedback board where your sales, support and product team log customer feedback and feature requests, vote on what matters, and track each request from new to shipped.

## What you get

- **Sign-in for your team, with roles.** Only people you invite can open the board. Members submit, vote and comment; admins also change status and merge duplicates.
- **A board ranked by votes.** Filter by status (new, planned, in progress, shipped, declined) and by tag. One vote per person per item, and pressing it again takes the vote back.
- **Item pages with comments**, plus the source of each request (sales call, support ticket, user interview) and the customer who asked.
- **Duplicate merging.** An admin folds a duplicate into the item being kept: its votes and comments move over in one transaction, and the duplicate's context is kept as a comment.
- **Managed Postgres** with migrations that run on every deploy.
- **An agent API.** A key-authenticated JSON API with an OpenAPI document, so an agent can file feedback from a support ticket, comment, and update status.

## Deploy with your agent

Paste this into Claude Code, Codex or Cursor:

```text
Deploy https://github.com/getfloo/feedback-board-template on floo. Follow https://getfloo.com/agents.md.
```

Or do it yourself:

1. Click **Use this template** on GitHub to create your own copy of the repo.
2. Install the CLI and sign in: `curl -fsSL https://getfloo.com/install.sh | bash`, then `floo auth login`.
3. [Install the floo GitHub App](https://github.com/apps/getfloo/installations/new) on your repo's owner and select the repo, then run `floo apps github setup`.
4. Connect the repo: `floo apps github connect <owner>/<repo>`. This creates the app and deploys it. Every push after that deploys again.
5. Invite your team: `floo apps invite teammate@example.com --role member --app feedback-board`. Use `--role admin` for the people who triage.

The app name comes from `name` in `floo.app.toml`; change it before connecting if you want a different one.

## Customize

Ask your agent to extend it. For example:

- "Add a weekly digest: a floo cron job that posts the top 10 new items by votes to our Slack webhook every Monday."
- "Add an `impact` field (low, medium, high) on items, show it on the board, and let admins sort by it."
- "When an item moves to shipped, email everyone who voted for it."
- "Add a `GET /api/items?q=` search so our support agent can check for an existing item before filing a new one."
- "Add a roadmap page that shows planned and in progress items as columns."

## Local development

```sh
npm install
floo dev --fixture-user you@example.com --fixture-role admin
```

`floo dev` runs the app locally against your app's dev database and prints an auth-proxied URL that signs you in as the fixture user. It needs the app connected first (see above). To fill an empty board with sample feedback:

```sh
floo run --service web -- npm run seed
```

The seed only writes to an empty board and never runs on deploy. `npm test` runs type checks, lint and tests without a database. `AGENTS.md` is the working guide for agents changing this app.

## How it works

| Route | Who | What |
| --- | --- | --- |
| `/` | Signed-in people | The board, sorted by votes, with status and tag filters |
| `/items/new` | Signed-in people | Submit form |
| `/items/<id>` | Signed-in people | Item page with comments; status and merge controls for admins |
| `/api-docs` | Signed-in people | The API reference |
| `/api/*` | API keys with the `api` scope | JSON API for agents and scripts |

**Roles.** floo's gateway signs people in and tells the app who they are and whether they are an `admin` or `member` of the app. Status changes and merges check for `admin` on the server.

**Data model.** `items` (title, description, source, customer, tags, status, author, `merged_into_id`), `votes` (one row per item and user), `comments`, and `users` (synced from sign-in). Schema in `db/schema.ts`, migrations in `drizzle/`.

**API.** Mint a key with `floo apps consumers create support-agent` and `floo apps keys create support-agent-key --consumer support-agent --scope api`, then call:

| Method | Path | What |
| --- | --- | --- |
| `GET` | `/api/items?status=&tag=` | List open items, most votes first |
| `POST` | `/api/items` | File an item |
| `GET` | `/api/items/{id}` | Read an item and its comments |
| `PATCH` | `/api/items/{id}` | Change status |
| `POST` | `/api/items/{id}/comments` | Add a comment |

```sh
curl -X POST https://<your-app-url>/api/items \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"Export invoices to CSV","source":"support_ticket","customer":"Northwind","tags":["export"]}'
```

The full contract is at `/api/openapi.json`. A key can change status like an admin can, so give keys only to agents you trust with that.

---

Built on [floo](https://getfloo.com): build internal software.
