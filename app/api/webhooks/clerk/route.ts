import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(request: NextRequest) {
  try {
    const event = await verifyWebhook(request);

    if (event.type === "user.created") {
      const { error } = await supabase.from("users").upsert(
        { clerk_id: event.data.id },
        { onConflict: "clerk_id" },
      );

      if (error) throw error;
    }

    return new Response("OK", { status: 200 });
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
}
