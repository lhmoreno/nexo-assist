import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { sessions, users } from "./schema";
/** Respostas de sessão e dados privados nunca devem ficar em cache. */
export const noStore = { headers: { "Cache-Control": "no-store" } };
export async function currentUser() {
  const token = (await cookies()).get("nexo_session")?.value;
  if (!token) return null;
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.token, token));
  if (!session || session.expiresAt < Date.now()) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId));
  return user ?? null;
}
export async function requireUser(role?: "employee" | "analyst") {
  const user = await currentUser();
  if (!user || (role && user.role !== role))
    throw new Error("Acesso não autorizado.");
  return user;
}
