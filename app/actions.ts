"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { syncUser } from "@/db/users";
import {
  CommentInput, ItemInput, StatusInput, addComment, authorOf, createItem, mergeItems, parse,
  requireAdmin, setStatus, splitTags, toggleVote,
} from "@/lib/feedback";
import { getIdentity } from "@/lib/identity";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

export async function submitItem(formData: FormData): Promise<void> {
  const user = await getIdentity();
  const input = parse(ItemInput, {
    title: field(formData, "title"),
    description: field(formData, "description"),
    source: field(formData, "source"),
    customer: field(formData, "customer"),
    tags: splitTags(field(formData, "tags")),
  });
  await syncUser(user);
  const item = await createItem(authorOf(user), input);
  revalidatePath("/");
  redirect(`/items/${item.id}`);
}

export async function vote(formData: FormData): Promise<void> {
  const user = await getIdentity();
  const itemId = field(formData, "itemId");
  await toggleVote(itemId, user.id);
  revalidatePath("/");
  revalidatePath(`/items/${itemId}`);
}

export async function comment(formData: FormData): Promise<void> {
  const user = await getIdentity();
  const itemId = field(formData, "itemId");
  const { body } = parse(CommentInput, { body: field(formData, "body") });
  await addComment(itemId, authorOf(user), body);
  revalidatePath(`/items/${itemId}`);
}

export async function changeStatus(formData: FormData): Promise<void> {
  const user = await getIdentity();
  requireAdmin(user);
  const itemId = field(formData, "itemId");
  const { status } = parse(StatusInput, { status: field(formData, "status") });
  await setStatus(itemId, status);
  revalidatePath("/");
  revalidatePath(`/items/${itemId}`);
}

export async function merge(formData: FormData): Promise<void> {
  const user = await getIdentity();
  requireAdmin(user);
  const keptId = field(formData, "keptId");
  await mergeItems(field(formData, "itemId"), keptId, authorOf(user));
  revalidatePath("/");
  redirect(`/items/${keptId}`);
}
