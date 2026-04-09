"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  callId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Modal that renders the existing `/api/reports/qa/[callId]` HTML report
 * inside a full-bleed iframe. The endpoint returns a self-contained
 * dark-themed HTML page (its own header with lead name, business,
 * closer, date, duration, big score badge, scorecard, pillar cards,
 * critical moment, pattern flags, action items — all already
 * beautifully styled).
 *
 * Layout notes:
 *
 * - We intentionally do NOT render a `DialogHeader` with a "Call QA
 *   Report" title. The iframe content already has its own `<h1>Call
 *   QA Report</h1>` in its header block, and duplicating it here just
 *   stole vertical space and looked visually odd (a big empty bar at
 *   the top with a single line of text, then a gap, then the iframe
 *   starting fresh with the exact same title).
 *
 * - `sm:max-w-5xl` explicitly overrides the base `DialogContent`'s
 *   `sm:max-w-sm` default. Without this override the modal is capped
 *   at ~24rem on any screen ≥640px because the responsive variant
 *   wins over a plain `max-w-*` class. `tailwind-merge` (via `cn`)
 *   correctly keeps the last matching responsive class.
 *
 * - `flex flex-col gap-0 p-0` replaces the base `grid gap-4 p-4` so
 *   the iframe can `flex-1` to fill the full `h-[90vh]` height. With
 *   the default `grid gap-4` the iframe rendered at its content
 *   intrinsic height and left weird blank space above and below.
 *
 * - `DialogTitle` is kept but marked `sr-only` so Base UI's Dialog
 *   still gets an accessible name via `aria-labelledby` without
 *   showing a visible title bar.
 */
export function QAReportModal({ callId, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 sm:max-w-5xl h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">Call QA Report</DialogTitle>
        <iframe
          src={`/api/reports/qa/${callId}`}
          className="flex-1 w-full border-0 bg-zinc-950"
          title="Call QA Report"
        />
      </DialogContent>
    </Dialog>
  );
}
