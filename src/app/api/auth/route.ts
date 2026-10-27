import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/schema";
import { currentUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { clearAnalystPresence, touchAnalyst } from "@/lib/metrics";
const login = z.object({
  email: z.email(),
  password: z.string().min(1),
  remember: z.boolean().default(true),
});
export async function POST(req: Request) {
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
  const user = db
    .select()
    .from(users)
    .where(eq(users.email, parsed.data.email.toLowerCase()))
    .get();
  if (!user)
    return NextResponse.json(
      { error: "Usuário de demonstração não encontrado." },
      { status: 401 },
    );
  const token = randomBytes(32).toString("hex");
  const maxAge = parsed.data.remember ? 7 * 86400 : 8 * 3600;
  db.insert(sessions)
    .values({ token, userId: user.id, expiresAt: Date.now() + maxAge * 1000 })
    .run();
  if (user.role === "analyst") touchAnalyst(user.id);
  const res = NextResponse.json({ user });
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
  return NextResponse.json({ user: await currentUser() });
}
export async function DELETE() {
  const token = (await cookies()).get("nexo_session")?.value;
  if (token) {
    const session = db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .get();
    if (session) clearAnalystPresence(session.userId);
    db.delete(sessions).where(eq(sessions.token, token)).run();
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("nexo_session");
  return res;
}
