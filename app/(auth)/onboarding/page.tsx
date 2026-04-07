"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteFlow, setInviteFlow] = useState<{
    checked: boolean;
    joining: boolean;
    orgName: string | null;
  }>({ checked: false, joining: false, orgName: null });
  const router = useRouter();

  // On mount: detect invite cookie and auto-join the org
  useEffect(() => {
    const token = readCookie("intro_invite_token");
    if (!token) {
      setInviteFlow({ checked: true, joining: false, orgName: null });
      return;
    }

    let cancelled = false;
    setInviteFlow({ checked: true, joining: true, orgName: null });

    fetch("/api/onboarding/join-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (cancelled) return;
        const body = await res.json().catch(() => ({}));
        if (res.ok || res.status === 409) {
          // Success or already onboarded — both are fine, redirect to dashboard
          clearCookie("intro_invite_token");
          router.push("/dashboard");
          router.refresh();
          return;
        }
        // Real error: show fallback to manual org creation
        setError(body.error ?? "Failed to join organization");
        setInviteFlow({ checked: true, joining: false, orgName: null });
        clearCookie("intro_invite_token");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setInviteFlow({ checked: true, joining: false, orgName: null });
        clearCookie("intro_invite_token");
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setLoading(true);
    setError(null);

    // Use server-side endpoint that creates the org, sets the user as admin,
    // configures allowed_email_domains from the user's email, and generates
    // a fresh invite_token. The next page (Settings) will display the link.
    const res = await fetch("/api/onboarding/create-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: orgName.trim() }),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(body.error ?? "Failed to create organization");
      setLoading(false);
      return;
    }

    setLoading(false);
    // Redirect to Settings so the new admin sees their invite link immediately
    router.push("/dashboard/settings");
    router.refresh();
  };

  // Loading while we check / process the invite
  if (!inviteFlow.checked || inviteFlow.joining) {
    return (
      <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-800">
        <CardContent className="py-8 text-center text-muted-foreground">
          {inviteFlow.joining
            ? "Joining your organization…"
            : "Loading…"}
        </CardContent>
      </Card>
    );
  }

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
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
