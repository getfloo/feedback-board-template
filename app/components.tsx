import Link from "next/link";
import { STATUS_LABELS, type Status } from "@/lib/feedback";
import { vote } from "./actions";

const STATUS_STYLES: Record<Status, string> = {
  new: "bg-surface text-muted",
  planned: "bg-info-soft text-info",
  in_progress: "bg-warning-soft text-warning",
  shipped: "bg-success-soft text-success",
  declined: "bg-danger-soft text-danger",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function TagLink({ tag }: { tag: string }) {
  return (
    <Link href={`/?tag=${encodeURIComponent(tag)}`}
      className="rounded-sm border bg-panel px-1.5 py-0.5 text-xs text-muted hover:text-ink">
      #{tag}
    </Link>
  );
}

/** One vote per signed-in user; pressing it again takes the vote back. */
export function VoteButton({ itemId, votes, voted }: { itemId: string; votes: number; voted: boolean }) {
  return (
    <form action={vote}>
      <input type="hidden" name="itemId" value={itemId} />
      <button type="submit" aria-pressed={voted} aria-label={voted ? `Remove your vote (${votes} votes)` : `Vote (${votes} votes)`}
        className={`flex h-14 w-12 shrink-0 cursor-pointer flex-col items-center justify-center rounded-md border text-sm font-semibold tabular-nums ${
          voted ? "border-accent bg-accent text-white hover:bg-accent-hover" : "bg-panel text-ink hover:border-accent"
        }`}>
        <svg aria-hidden viewBox="0 0 12 8" className="mb-1 h-2 w-3 fill-current"><path d="M6 0l6 8H0z" /></svg>
        {votes}
      </button>
    </form>
  );
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" });
}
