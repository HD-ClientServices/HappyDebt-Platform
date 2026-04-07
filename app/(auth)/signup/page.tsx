"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Building2, AlertTriangle } from "lucide-react";

interface InviteLookup {
  valid: boolean;
  orgId?: string;
  orgName?: string;
  allowedDomains?: string[] | null;
}

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const inviteToken = searchParams.get("invite") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteState, setInviteState] = useState<{
    loading: boolean;
    data: InviteLookup | null;
  }>({ loading: !!inviteToken, data: null });

  // Validate the invite token on mount
  useEffect(() => {
    if (!inviteToken) {
      setInviteState({ loading: false, data: { valid: false } });
      return;
    }
    let cancelled = false;
    fetch(`/api/invites/lookup?token=${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as InviteLookup;
          setInviteState({ loading: false, data });
        } else {
          setInviteState({ loading: false, data: { valid: false } });
        }
      })
      .catch(() => {
        if (!cancelled) setInviteState({ loading: false, data: { valid: false } });
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (!inviteState.data?.valid) {
      setError("A valid invite link is required");
      return;
    }

    // Validate email domain against the org's allowed_email_domains (if any)
    const allowed = inviteState.data.allowedDomains;
    if (allowed && allowed.length > 0) {
      const userDomain = email.toLowerCase().split("@")[1] ?? "";
      const normalized = allowed.map((d) => d.toLowerCase());
      if (!normalized.includes(userDomain)) {
        setError(
          `Email must end in ${normalized.map((d) => `@${d}`).join(" or ")}`
        );
        return;
      }
    }

    setLoading(true);

    const { error: signupErr } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signupErr) {
      setError(signupErr.message);
      setLoading(false);
      return;
    }

    // Persist the invite token in a cookie that the onboarding page reads
    document.cookie = `intro_invite_token=${inviteToken}; path=/; max-age=600; SameSite=Lax`;

    setLoading(false);
    router.push("/onboarding");
    router.refresh();
  };

  // Loading state while validating the invite
  if (inviteState.loading) {
    return (
      <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-800">
        <CardContent className="py-8 text-center text-muted-foreground">
          Validating invite link…
        </CardContent>
      </Card>
    );
  }

  // No token or invalid token: show invite-only message
  if (!inviteState.data?.valid) {
    return (
      <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Invite required</CardTitle>
          <CardDescription>Signup is invite-only</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200">
              {inviteToken
                ? "This invite link is invalid or has been revoked. Ask your team admin for a new link."
                : "Ask your team admin to share an invite link with you. The link will look like https://…/signup?invite=…"}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full border-zinc-700"
            onClick={() => router.push("/login")}
          >
            Already have an account? Sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Valid invite: show signup form
  return (
    <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Create your account</CardTitle>
        <CardDescription>
          You&apos;ll be added as a viewer once your account is created
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-sm text-emerald-200">
              You&apos;re joining{" "}
              <strong className="text-emerald-100">
                {inviteState.data.orgName}
              </strong>
            </span>
          </div>
          {inviteState.data.allowedDomains &&
            inviteState.data.allowedDomains.length > 0 && (
              <p className="ml-6 mt-1 text-xs text-emerald-300/80">
                Only{" "}
                {inviteState.data.allowedDomains
                  .map((d) => `@${d}`)
                  .join(" or ")}{" "}
                emails can join.
              </p>
            )}
          {(!inviteState.data.allowedDomains ||
            inviteState.data.allowedDomains.length === 0) && (
            <p className="ml-6 mt-1 text-xs text-emerald-300/80">
              Your email&apos;s domain will become this organization&apos;s
              allowed domain.
            </p>
          )}
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="At least 8 characters"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          {error && <p className="text-sm text-rose-500">{error}</p>}
          <Button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={loading}
          >
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
