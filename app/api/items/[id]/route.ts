import { answer, readJson } from "@/lib/api";
import { NotFound, StatusInput, getItem, listComments, parse, requireStatusChanger, setStatus } from "@/lib/feedback";
import { callerFrom } from "@/lib/identity";

export async function GET(request: Request, { params }: RouteContext<"/api/items/[id]">): Promise<Response> {
  callerFrom(request.headers);
  const { id } = await params;
  return answer(async () => {
    const item = await getItem(id);
    if (!item) throw new NotFound("Item not found.");
    return Response.json({ item, comments: await listComments(item.id) });
  });
}

// Any key holding the "api" scope may change status, the same as an app admin. A
// member's own floo key arrives as that member, who must be an admin.
export async function PATCH(request: Request, { params }: RouteContext<"/api/items/[id]">): Promise<Response> {
  const caller = callerFrom(request.headers);
  const { id } = await params;
  return answer(async () => {
    requireStatusChanger(caller);
    const { status } = parse(StatusInput, await readJson(request));
    return Response.json({ item: await setStatus(id, status) });
  });
}
