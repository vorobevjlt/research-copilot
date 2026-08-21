import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function ChatPage() {
  await auth.protect();
  redirect("/dashboard/projects");
}
