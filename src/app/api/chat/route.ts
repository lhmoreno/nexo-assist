import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { conversationState, handleChat } from "@/lib/conversation";
const body = z.object({
  action: z.enum(["send", "confirm", "cancel", "select", "transfer"]),
  text: z.string().optional(),
  ticketId: z.string().optional(),
});
export async function GET() {
  try {
    const u = await requireUser("employee");
    return NextResponse.json({
      ...conversationState(u.id),
      demo: process.env.DEMO_MODE === "true",
    });
  } catch {
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  }
}
export async function POST(req: Request) {
  try {
    const u = await requireUser("employee");
    const input = body.parse(await req.json());
    return NextResponse.json(await handleChat(u.id, input));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro no chat." },
      { status: 400 },
    );
  }
}
