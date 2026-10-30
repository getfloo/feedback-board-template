import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  MAX_TEXT_LENGTH, SOURCE_LABELS, STATUSES, STATUS_LABELS, getItem, listComments, listItems, votedItemIds,
} from "@/lib/feedback";
import { getIdentity } from "@/lib/identity";
import { changeStatus, comment, merge } from "../../actions";
import { StatusBadge, TagLink, VoteButton, formatDate } from "../../components";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const identity = await getIdentity();
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();
  if (item.mergedIntoId) redirect(`/items/${item.mergedIntoId}`);

  const isAdmin = identity.role === "admin";
  const [itemComments, voted, mergeTargets] = await Promise.all([
    listComments(item.id),
    votedItemIds(identity.id),
    isAdmin ? listItems() : Promise.resolve([]),
  ]);
  const others = mergeTargets.filter((other) => other.id !== item.id).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <article className="min-w-0">
        <Link href="/" className="text-sm text-muted hover:text-ink">&larr; Board</Link>
        <div className="mt-4 flex gap-4">
          <VoteButton itemId={item.id} votes={item.votes} voted={voted.has(item.id)} />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">{item.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              <StatusBadge status={item.status} />
              <span>{SOURCE_LABELS[item.source]}</span>
              {item.customer && <span>· {item.customer}</span>}
            </div>
          </div>
        </div>

        {item.description ? (
          <p className="mt-6 whitespace-pre-wrap wrap-anywhere leading-relaxed">{item.description}</p>
        ) : (
          <p className="mt-6 text-muted">No description.</p>
        )}
        {item.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">{item.tags.map((tag) => <TagLink key={tag} tag={tag} />)}</div>
        )}
        <p className="mt-4 text-xs text-muted">Filed by {item.authorName} on {formatDate(item.createdAt)}</p>

        <section aria-labelledby="comments-heading" className="mt-10">
          <h2 id="comments-heading" className="mb-4 text-lg font-semibold">
            Comments <span className="ml-1 font-normal text-muted">({itemComments.length})</span>
          </h2>
          {itemComments.length === 0 ? (
            <p className="mb-6 text-sm text-muted">No comments yet. Add context from your own calls, or a link to a ticket.</p>
          ) : (
            <ul className="mb-6 space-y-3">
              {itemComments.map((entry) => (
                <li key={entry.id} className="rounded-md border bg-panel p-4">
                  <p className="text-sm">
                    <span className="font-medium">{entry.authorName}</span>
                    <span className="ml-2 text-muted">{formatDate(entry.createdAt)}</span>
                  </p>
                  <p className="mt-2 whitespace-pre-wrap wrap-anywhere leading-relaxed">{entry.body}</p>
                </li>
              ))}
            </ul>
          )}
          <form action={comment}>
            <input type="hidden" name="itemId" value={item.id} />
            <label htmlFor="body" className="sr-only">Add a comment</label>
            <textarea id="body" name="body" required maxLength={MAX_TEXT_LENGTH} rows={3}
              placeholder="Add a comment" className="block w-full resize-y" />
            <button type="submit"
              className="mt-3 rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover">
              Comment
            </button>
          </form>
        </section>
      </article>

      {isAdmin && (
        <aside className="space-y-6 lg:pt-10">
          <form action={changeStatus} className="rounded-md border bg-panel p-4">
            <input type="hidden" name="itemId" value={item.id} />
            <label htmlFor="status" className="mb-2 block text-sm font-medium">Status</label>
            <select id="status" name="status" defaultValue={item.status} className="w-full">
              {STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
            <button type="submit" className="mt-3 w-full rounded-sm border bg-panel px-3 py-2 text-sm font-medium hover:border-accent">
              Update status
            </button>
          </form>

          <form action={merge} className="rounded-md border bg-panel p-4">
            <input type="hidden" name="itemId" value={item.id} />
            <label htmlFor="keptId" className="mb-1 block text-sm font-medium">Merge duplicate</label>
            <p className="mb-3 text-xs text-muted">
              Moves this item&apos;s votes and comments to the item you pick, then hides this one.
            </p>
            {others.length === 0 ? (
              <p className="text-sm text-muted">There are no other open items to merge into.</p>
            ) : (
              <>
                <select id="keptId" name="keptId" required defaultValue="" className="w-full">
                  <option value="" disabled>Pick the item to keep</option>
                  {others.map((other) => <option key={other.id} value={other.id}>{other.title}</option>)}
                </select>
                <button type="submit" className="mt-3 w-full rounded-sm border bg-panel px-3 py-2 text-sm font-medium text-danger hover:border-danger">
                  Merge into selected item
                </button>
              </>
            )}
          </form>
          <p className="text-xs text-muted">Only admins see these controls.</p>
        </aside>
      )}
    </div>
  );
}
