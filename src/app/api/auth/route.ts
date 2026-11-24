import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/schema";
import { blockBots, currentUser, noStore } from "@/lib/auth";
import { cookies } from "next/headers";
import { clearAnalystPresence, touchAnalyst } from "@/lib/metrics";
const login = z.object({
  email: z.email(),
  password: z.string().min(1),
  remember: z.boolean().default(true),
});
export async function POST(req: Request) {
  const bot = await blockBots();
  if (bot) return bot;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const parsed = login.safeParse(payload);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Informe e-mail e senha." },
      { status: 400 },
    );
  const user = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()))
    .get();
  if (!user)
    return NextResponse.json(
      { error: "Usuário de demonstração não encontrado." },
      { status: 401 },
    );
  // Um novo login encerra a sessão anterior deste navegador, se houver.
  const previous = (await cookies()).get("nexo_session")?.value;
  if (previous) {
    const old = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, previous))
      .get();
    if (old) await clearAnalystPresence(old.userId);
    await db.delete(sessions).where(eq(sessions.token, previous));
  }
  const token = randomBytes(32).toString("hex");
  const maxAge = parsed.data.remember ? 7 * 86400 : 8 * 3600;
  await db
    .insert(sessions)
    .values({ token, userId: user.id, expiresAt: Date.now() + maxAge * 1000 });
  if (user.role === "analyst") await touchAnalyst(user.id);
  const res = NextResponse.json({ user }, noStore);
  res.cookies.set("nexo_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(parsed.data.remember ? { maxAge } : {}),
  });
  return res;
}
export async function GET() {
  return NextResponse.json({ user: await currentUser() }, noStore);
}
export async function DELETE() {
  const token = (await cookies()).get("nexo_session")?.value;
  if (token) {
    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .get();
    if (session) await clearAnalystPresence(session.userId);
    await db.delete(sessions).where(eq(sessions.token, token));
  }
  const res = NextResponse.json({ ok: true }, noStore);
  res.cookies.delete("nexo_session");
  return res;
}
