"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-client";

interface Props {
  liveTransferId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal that lets the client send feedback to the Intro team about a
 * specific live transfer. Submits to POST /api/live-transfers/[id]/feedback
 * which inserts a row in the live_transfer_feedback table.
 */
export function FeedbackModal({ liveTransferId, open, onClose }: Props) {
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(
        `/api/live-transfers/${liveTransferId}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating, comment: comment.trim() || null }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to submit feedback");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(() => {
        onClose();
        // Reset state for next time
        setSubmitted(false);
        setRating(0);
        setComment("");
      }, 1500);
    },
  });

  const handleClose = () => {
    if (mutation.isPending) return;
    onClose();
    setRating(0);
    setComment("");
    setSubmitted(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Send feedback to Intro
          </DialogTitle>
          <DialogDescription>
            Help us improve lead generation. Your feedback goes directly to
            the Intro team.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <p className="text-sm text-zinc-300">
              Thanks! Your feedback was sent to the Intro team.
            </p>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Star rating */}
            <div className="space-y-2">
              <Label>How was this lead?</Label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className="p-1"
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => setRating(star)}
                  >
                    <Star
                      className={cn(
                        "h-6 w-6 transition-colors",
                        (hover || rating) >= star
                          ? "fill-amber-400 text-amber-400"
                          : "text-zinc-600"
                      )}
                    />
                  </button>
                ))}
                {rating > 0 && (
                  <span className="ml-2 text-xs text-zinc-400">
                    {rating} / 5
                  </span>
                )}
              </div>
            </div>

            {/* Comment */}
            <div className="space-y-2">
              <Label htmlFor="feedback-comment">
                Comment{" "}
                <span className="text-xs text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="feedback-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What worked well? What could be better?"
                rows={4}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            {mutation.isError && (
              <p className="text-sm text-rose-400">
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Failed to submit"}
              </p>
            )}
          </div>
        )}

        {!submitted && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleClose}
              className="border-zinc-700"
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={rating === 0 || mutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit feedback
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
