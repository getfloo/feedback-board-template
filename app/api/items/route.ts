import { answer, readJson } from "@/lib/api";
import { ItemInput, ListFilters, authorOf, createItem, listItems, parse } from "@/lib/feedback";
import { callerFrom } from "@/lib/identity";

// The gateway serves /api only to callers holding an app API key with the "api"
// scope ([[routes]] in floo.app.toml) and has already verified the key. Items an
// agent files are authored by the key's consumer. The contract is in ./openapi.ts.

export async function GET(request: Request): Promise<Response> {
  callerFrom(request.headers);
  return answer(async () => {
    const filters = parse(ListFilters, Object.fromEntries(new URL(request.url).searchParams));
    return Response.json({ items: await listItems(filters) });
  });
}

export async function POST(request: Request): Promise<Response> {
  const caller = callerFrom(request.headers);
  return answer(async () => {
    const input = parse(ItemInput, await readJson(request));
    return Response.json({ item: await createItem(authorOf(caller), input) }, { status: 201 });
  });
}
