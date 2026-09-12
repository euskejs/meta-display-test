import { createDisplayApi } from "@/lib/display-api";
import { createMessageStore } from "@/lib/messages";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return createDisplayApi(
    process.env.DISPLAY_API_KEY,
    createMessageStore(process.env).write,
  )(request);
}
