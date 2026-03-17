/**
 * Shared utility for finding or creating closers by name.
 * Closer names come from the GHL contact custom field {{contact.closer}}.
 * Names are free-text and may have inconsistent casing.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export async function findOrCreateCloser(
  supabase: SupabaseClient,
  orgId: string,
  closerName: string
): Promise<string | null> {
  const trimmed = closerName.trim();
  if (!trimmed || trimmed === "N/A") return null;

  // Case-insensitive exact match (ilike without wildcards)
  const { data: existing } = await supabase
    .from("closers")
    .select("id")
    .eq("org_id", orgId)
    .ilike("name", trimmed)
    .maybeSingle();

  if (existing) return existing.id;

  // Create new closer with raw name (preserves original casing)
  const { data: newCloser } = await supabase
    .from("closers")
    .insert({ org_id: orgId, name: trimmed, active: true })
    .select("id")
    .single();

  return newCloser?.id || null;
}

/**
 * Find or create a closer by GHL user ID.
 * Used during opportunity sync where assignedTo gives us the GHL user ID.
 * Updates name/email/phone on existing closers to keep data fresh.
 */
export async function findOrCreateCloserByGhlUserId(
  supabase: SupabaseClient,
  orgId: string,
  ghlUserId: string,
  userName: string,
  userEmail?: string,
  userPhone?: string
): Promise<string | null> {
  if (!ghlUserId) return null;

  const { data: existing } = await supabase
    .from("closers")
    .select("id")
    .eq("org_id", orgId)
    .eq("ghl_user_id", ghlUserId)
    .maybeSingle();

  if (existing) {
    // Keep name/email fresh
    await supabase
      .from("closers")
      .update({
        name: userName,
        ...(userEmail ? { email: userEmail } : {}),
        ...(userPhone ? { phone: userPhone } : {}),
      })
      .eq("id", existing.id);
    return existing.id;
  }

  const { data: newCloser } = await supabase
    .from("closers")
    .insert({
      org_id: orgId,
      ghl_user_id: ghlUserId,
      name: userName,
      email: userEmail || null,
      phone: userPhone || null,
      active: true,
    })
    .select("id")
    .single();

  return newCloser?.id || null;
}
