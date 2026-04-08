"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  liveTransferId: string;
  disabled?: boolean;
}

/**
 * Per-row button that triggers a reconnect of the lead. Internally it
 * POSTs to /api/live-transfers/[id]/reconnect which forwards a payload
 * to the org's configured ghl_reconnect_webhook_url with the same body
 * format as the user's existing Make.com workflow:
 *   { contactId, source: "intro_platform_recontact" }
 */
export function ReconnectButton({ liveTransferId, disabled }: Props) {
  const [feedback, setFeedback] = useState<"success" | "error" | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(
        `/api/live-transfers/${liveTransferId}/reconnect`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Reconnect failed");
      }
      return body;
    },
    onSuccess: () => {
      setFeedback("success");
      setTimeout(() => setFeedback(null), 2500);
    },
    onError: () => {
      setFeedback("error");
      setTimeout(() => setFeedback(null), 3500);
    },
  });

  const handleClick = () => {
    if (mutation.isPending) return;
    if (
      !window.confirm(
        "Reconnect this lead? An automation will fire in your CRM."
      )
    )
      return;
    mutation.mutate();
  };

  const title = disabled
    ? "Cannot reconnect: missing GHL contact id"
    : feedback === "success"
      ? "Reconnect triggered"
      : feedback === "error"
        ? mutation.error instanceof Error
          ? mutation.error.message
          : "Failed"
        : "Reconnect lead";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="h-7 w-7"
      title={title}
      disabled={disabled || mutation.isPending}
      onClick={handleClick}
    >
      {mutation.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : feedback === "success" ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      ) : feedback === "error" ? (
        <XCircle className="h-3.5 w-3.5 text-rose-500" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
