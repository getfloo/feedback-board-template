import Link from "next/link";
import { syncUser } from "@/db/users";
import {
  ListFilters, SOURCE_LABELS, STATUSES, STATUS_LABELS, boardFacets, listItems, votedItemIds,
} from "@/lib/feedback";
import { getIdentity } from "@/lib/identity";
import { StatusBadge, TagLink, VoteButton } from "./components";

export const dynamic = "force-dynamic";

function boardHref(filters: { status?: string; tag?: string }): string {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as [string, string][]);
  return query.size ? `/?${query}` : "/";
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`rounded-sm border px-3 py-1.5 text-sm whitespace-nowrap ${
        active ? "border-ink bg-ink text-white" : "bg-panel text-muted hover:text-ink"
      }`}>
      {children}
    </Link>
  );
}

export default async function Board({ searchParams }: PageProps<"/">) {
  const identity = await getIdentity();
  await syncUser(identity);

  // Unknown filter values fall back to showing everything rather than an error page.
  const raw = await searchParams;
  const parsed = ListFilters.safeParse({ status: raw.status, tag: raw.tag });
  const filters = parsed.success ? parsed.data : {};
  const [items, facets, voted] = await Promise.all([listItems(filters), boardFacets(), votedItemIds(identity.id)]);
  const total = Object.values(facets.counts).reduce((sum, count) => sum + count, 0);

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Feedback board</h1>
          <p className="mt-1 text-muted">What customers are asking for, ranked by the team&apos;s votes.</p>
        </div>
        <Link href="/items/new"
          className="rounded-sm bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
          Submit feedback
        </Link>
      </header>

      <nav aria-label="Filter by status" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <Pill href={boardHref({ tag: filters.tag })} active={!filters.status}>All {total}</Pill>
        {STATUSES.map((status) => (
          <Pill key={status} href={boardHref({ status, tag: filters.tag })} active={filters.status === status}>
            {STATUS_LABELS[status]} {facets.counts[status]}
          </Pill>
        ))}
      </nav>

      {facets.tags.length > 0 && (
        <nav aria-label="Filter by tag" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Tags:</span>
          {facets.tags.map((tag) => (
            <Link key={tag} href={boardHref({ status: filters.status, tag: filters.tag === tag ? undefined : tag })}
              aria-current={filters.tag === tag ? "page" : undefined}
              className={`rounded-sm px-2 py-0.5 ${filters.tag === tag ? "bg-accent text-white" : "border bg-panel text-muted hover:text-ink"}`}>
              #{tag}
            </Link>
          ))}
          {filters.tag && <Link href={boardHref({ status: filters.status })} className="text-muted underline hover:text-ink">Clear tag</Link>}
        </nav>
      )}

      {total === 0 ? (
        <div className="rounded-md border border-dashed bg-panel p-10 text-center">
          <h2 className="font-medium">No feedback yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Log the first request from a sales call, support ticket or user interview. Your team can vote on
            it and an admin can move it from new to shipped.
          </p>
          <Link href="/items/new" className="mt-5 inline-block rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
            Submit feedback
          </Link>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-muted">
          Nothing matches these filters. <Link href="/" className="underline hover:text-ink">Show all feedback</Link>
        </p>
      ) : (
        <ul className="divide-y rounded-md border bg-panel">
          {items.map((item) => (
            <li key={item.id} className="flex gap-4 p-4">
              <VoteButton itemId={item.id} votes={item.votes} voted={voted.has(item.id)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link href={`/items/${item.id}`} className="font-medium wrap-anywhere hover:text-accent">{item.title}</Link>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-1 text-sm text-muted">
                  {SOURCE_LABELS[item.source]}
                  {item.customer && <> · {item.customer}</>}
                  {" · "}{item.comments} {item.comments === 1 ? "comment" : "comments"}
                </p>
                {item.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => <TagLink key={tag} tag={tag} />)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
