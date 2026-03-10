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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setMagicLinkSent(true);
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <CardTitle className="font-heading text-xl">
          HappyDebt Client Portal
        </CardTitle>
        <CardDescription>
          Sign in with magic link or password
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {magicLinkSent ? (
          <p className="text-sm text-emerald-500">
            Check your email for the magic link.
          </p>
        ) : (
          <>
            <form onSubmit={handleMagicLink} className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-zinc-800 border-zinc-700"
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending…" : "Send magic link"}
              </Button>
            </form>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
                <span className="bg-zinc-900 px-2">Or</span>
              </div>
            </div>
            <form onSubmit={handlePassword} className="space-y-2">
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-zinc-800 border-zinc-700"
              />
              <Button type="submit" variant="secondary" className="w-full" disabled={loading}>
                Sign in with password
              </Button>
            </form>
          </>
        )}
        {error && (
          <p className="text-sm text-rose-500">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
