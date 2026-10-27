import { NextResponse } from "next/server";
import { getServiceMetrics } from "@/lib/metrics";

export function GET() {
  return NextResponse.json(getServiceMetrics(), {
    headers: { "Cache-Control": "no-store" },
  });
}
