import { answer, readJson } from "@/lib/api";
import { CommentInput, addComment, authorOf, parse } from "@/lib/feedback";
import { callerFrom } from "@/lib/identity";

export async function POST(request: Request, { params }: RouteContext<"/api/items/[id]/comments">): Promise<Response> {
  const caller = callerFrom(request.headers);
  const { id } = await params;
  return answer(async () => {
    const { body } = parse(CommentInput, await readJson(request));
    return Response.json({ comment: await addComment(id, authorOf(caller), body) }, { status: 201 });
  });
}
