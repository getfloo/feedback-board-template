import { MAX_TAGS, MAX_TEXT_LENGTH, MAX_TITLE_LENGTH, SOURCES, SOURCE_LABELS } from "@/lib/feedback";
import { getIdentity } from "@/lib/identity";
import { submitItem } from "../../actions";

export const dynamic = "force-dynamic";

const label = "mb-1.5 block text-sm font-medium";
const hint = "font-normal text-muted";

export default async function SubmitFeedback() {
  await getIdentity();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Submit feedback</h1>
      <p className="mt-1 mb-8 text-muted">One request per item. If it is already on the board, vote for it instead.</p>

      <form action={submitItem} className="space-y-5">
        <div>
          <label htmlFor="title" className={label}>Title</label>
          <input id="title" name="title" required minLength={3} maxLength={MAX_TITLE_LENGTH}
            placeholder="Export invoices to CSV" className="w-full" />
        </div>
        <div>
          <label htmlFor="description" className={label}>Description <span className={hint}>(optional)</span></label>
          <textarea id="description" name="description" rows={5} maxLength={MAX_TEXT_LENGTH}
            placeholder="What they asked for, why it matters to them, and any quotes."
            className="w-full resize-y" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="source" className={label}>Source</label>
            <select id="source" name="source" required defaultValue="sales_call" className="w-full">
              {SOURCES.map((source) => <option key={source} value={source}>{SOURCE_LABELS[source]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="customer" className={label}>Customer <span className={hint}>(optional)</span></label>
            <input id="customer" name="customer" maxLength={120} placeholder="Northwind Logistics" className="w-full" />
          </div>
        </div>
        <div>
          <label htmlFor="tags" className={label}>Tags <span className={hint}>(comma separated, up to {MAX_TAGS})</span></label>
          <input id="tags" name="tags" placeholder="reporting, export" className="w-full" />
        </div>
        <button type="submit"
          className="rounded-sm bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover">
          Submit feedback
        </button>
      </form>
    </div>
  );
}
