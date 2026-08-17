/**
 * Admin allow-list. Configurable via NEXT_PUBLIC_ADMIN_EMAILS (comma-separated);
 * defaults to the project owner.
 *
 * NOTE: This is a client-side gate for the demo. Real enforcement comes with
 * Firestore security rules (admin via email/custom-claim) once data moves to
 * Firestore.
 */
const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS || "carkci.caner@gmail.com";

export const ADMIN_EMAILS = raw
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(user: { email?: string | null } | null | undefined): boolean {
  return !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
}
