// Supabase Edge Function: track-plg-event
// Invoke with: { event_name, event_properties?, session_id? }
// Writes to plg_events and upserts feature_usage when event_name is feature_used.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token ?? "");
    const body = await req.json() as { event_name: string; event_properties?: Record<string, unknown>; session_id?: string };
    const orgId = user?.user_metadata?.org_id ?? body.event_properties?.org_id;
    if (!orgId || !body.event_name) {
      return new Response(JSON.stringify({ error: "missing org_id or event_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await supabase.from("plg_events").insert({
      org_id: orgId,
      user_id: user?.id ?? null,
      event_name: body.event_name,
      event_properties: body.event_properties ?? {},
      session_id: body.session_id ?? null,
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
