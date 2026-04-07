"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, RefreshCw, UserPlus, Loader2 } from "lucide-react";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import { apiFetch } from "@/lib/api-client";

interface InviteLinkResponse {
  orgId: string;
  orgName: string;
  token: string;
  link: string;
  allowedDomains: string[] | null;
}

const ALLOWED_ROLES = new Set(["admin", "manager", "intro_admin"]);

export function InviteCollaborators() {
  const { data: userOrg } = useCurrentUserOrg();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const canManage =
    userOrg?.role && ALLOWED_ROLES.has(userOrg.role);

  const { data: inviteData, isLoading } = useQuery<InviteLinkResponse | null>({
    queryKey: ["invite-link", userOrg?.orgId],
    enabled: !!userOrg?.orgId && !!canManage,
    queryFn: async () => {
      const res = await apiFetch("/api/admin/invite-link");
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/admin/invite-link/regenerate", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to regenerate link");
      }
      return (await res.json()) as InviteLinkResponse;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["invite-link", userOrg?.orgId], data);
    },
  });

  if (!canManage) return null;

  const handleCopy = async () => {
    if (!inviteData?.link) return;
    try {
      await navigator.clipboard.writeText(inviteData.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleRegenerate = () => {
    if (
      !window.confirm(
        "Regenerate the invite link? The previous link will stop working immediately."
      )
    )
      return;
    regenerateMutation.mutate();
  };

  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <div className="flex items-center gap-3">
          <UserPlus className="h-5 w-5 text-emerald-500" />
          <div>
            <CardTitle className="font-heading">Invite collaborators</CardTitle>
            <CardDescription>
              Share this link with people you want to invite to{" "}
              <strong className="text-zinc-300">
                {inviteData?.orgName ?? "your org"}
              </strong>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading invite link…
          </div>
        ) : !inviteData ? (
          <p className="text-sm text-rose-400">
            Couldn&apos;t load invite link. Make sure migration 00011 is applied.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="invite-link-input">Invite link</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-link-input"
                  readOnly
                  value={inviteData.link}
                  className="bg-zinc-800 border-zinc-700 font-mono text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  className="border-zinc-700 shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="mr-2 h-4 w-4 text-emerald-500" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              {inviteData.allowedDomains && inviteData.allowedDomains.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Only{" "}
                  <span className="text-zinc-300 font-medium">
                    {inviteData.allowedDomains.map((d) => `@${d}`).join(" or ")}
                  </span>{" "}
                  emails can join {inviteData.orgName} via this link. Joinees
                  are added as viewers.
                </p>
              ) : (
                <p className="text-xs text-amber-400/80">
                  No domain restriction set yet. The first user to join via
                  this link becomes the admin and their domain will become the
                  allowed domain for future invites.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700"
                onClick={handleRegenerate}
                disabled={regenerateMutation.isPending}
              >
                {regenerateMutation.isPending ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3 w-3" />
                )}
                Regenerate link
              </Button>
              <p className="text-xs text-muted-foreground">
                Regenerating revokes the previous link.
              </p>
            </div>

            {regenerateMutation.isError && (
              <p className="text-sm text-rose-400">
                {regenerateMutation.error instanceof Error
                  ? regenerateMutation.error.message
                  : "Failed to regenerate"}
              </p>
            )}
            {regenerateMutation.isSuccess && (
              <p className="text-sm text-emerald-500">
                Link regenerated. Old link is now revoked.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
