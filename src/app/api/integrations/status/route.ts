import { connection } from "next/server";
import { connectionStates } from "@/lib/integrations/config";

// Which platforms are configured and connected. Names of missing settings only, never values.
export async function GET() {
  await connection(); // read the environment at request time, not at build
  return Response.json({ platforms: await connectionStates() }, { headers: { "Cache-Control": "no-store" } });
}
