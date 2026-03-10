// Supabase Edge Function: generate-suggestions
// Returns 4 contextual suggestions for the VoC page. Call with { org_id }.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FALLBACK = [
  { icon: "Search", text: "Compare sentiment trends between your top and bottom closers this week" },
  { icon: "BarChart3", text: "Benchmark your team's avg score against last month's baseline" },
  { icon: "Microscope", text: "Deep-dive into calls where sentiment is positive but score is low" },
  { icon: "Wrench", text: "Build a custom evaluation template focused on your team's weakest criteria" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const body = (await req.json()) as { org_id?: string };
    const orgId = body.org_id;
    if (!orgId) {
      return new Response(JSON.stringify({ suggestions: FALLBACK }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    // Optional: fetch org stats and call Claude for custom suggestions
    return new Response(JSON.stringify({ suggestions: FALLBACK }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), suggestions: FALLBACK }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
