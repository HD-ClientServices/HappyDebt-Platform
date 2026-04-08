"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  callId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Renders the existing /api/reports/qa/[callId] HTML report inside a
 * modal iframe. The endpoint returns a self-contained dark-themed HTML
 * page with the Claude QA analysis (criteria, scores, strengths,
 * improvement areas, action plan if critical).
 */
export function QAReportModal({ callId, open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 max-w-4xl h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-zinc-800">
          <DialogTitle className="font-heading text-lg">
            Call QA Report
          </DialogTitle>
        </DialogHeader>
        <iframe
          src={`/api/reports/qa/${callId}`}
          className="w-full h-full border-0 bg-zinc-950"
          title="Call QA Report"
        />
      </DialogContent>
    </Dialog>
  );
}
