import { NextResponse } from "next/server";
import { getServiceMetrics } from "@/lib/metrics";

export async function GET() {
  return NextResponse.json(await getServiceMetrics(), {
    headers: { "Cache-Control": "no-store" },
  });
}
