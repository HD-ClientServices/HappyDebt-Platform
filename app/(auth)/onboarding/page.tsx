"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setLoading(true);
    const slug = orgName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name: orgName.trim(),
        slug: slug || "org",
      })
      .select("id")
      .single();
    if (orgErr || !org) {
      setLoading(false);
      return;
    }
    await supabase.from("users").upsert({
      id: user.id,
      org_id: org.id,
      email: user.email ?? "",
      onboarding_completed: true,
    });
    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <CardTitle className="font-heading text-xl">
          Set up your organization
        </CardTitle>
        <CardDescription>
          Step 1 of 2 — Organization name
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateOrg} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="orgName">Organization name</Label>
            <Input
              id="orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Funding Co."
              className="bg-zinc-800 border-zinc-700"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
