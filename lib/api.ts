import "server-only";
import { FeedbackError } from "./feedback";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new FeedbackError("Send a JSON body. The schema is at /api/openapi.json.");
  }
}

/** Runs a handler and answers the errors a caller can fix with their status and message. */
export async function answer(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof FeedbackError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
