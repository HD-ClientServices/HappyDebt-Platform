"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { useLeadUpload } from "@/hooks/useLeadUpload";
import { trackEvent } from "@/lib/plg";

interface LeadUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedLead {
  name: string;
  phone?: string;
  email?: string;
  business_name?: string;
}

export function LeadUploadDialog({ open, onOpenChange }: LeadUploadDialogProps) {
  const [parsedLeads, setParsedLeads] = useState<ParsedLead[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const upload = useLeadUpload();

  const parseCSV = useCallback((text: string): ParsedLead[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row.");

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));

    const nameIdx = headers.findIndex((h) =>
      ["name", "lead_name", "full_name", "contact_name", "nombre"].includes(h)
    );
    const phoneIdx = headers.findIndex((h) =>
      ["phone", "phone_number", "telefono", "lead_phone"].includes(h)
    );
    const emailIdx = headers.findIndex((h) =>
      ["email", "lead_email", "correo", "e-mail"].includes(h)
    );
    const businessIdx = headers.findIndex((h) =>
      ["business", "business_name", "company", "empresa", "company_name"].includes(h)
    );

    if (nameIdx === -1) {
      throw new Error(
        'CSV must have a "name" column. Found columns: ' + headers.join(", ")
      );
    }

    const leads: ParsedLead[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/"/g, ""));
      const name = cols[nameIdx];
      if (!name) continue;

      leads.push({
        name,
        phone: phoneIdx >= 0 ? cols[phoneIdx] || undefined : undefined,
        email: emailIdx >= 0 ? cols[emailIdx] || undefined : undefined,
        business_name: businessIdx >= 0 ? cols[businessIdx] || undefined : undefined,
      });
    }

    return leads;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setParseError(null);
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const leads = parseCSV(text);
          setParsedLeads(leads);
        } catch (err) {
          setParseError(err instanceof Error ? err.message : "Failed to parse CSV");
          setParsedLeads([]);
        }
      };
      reader.readAsText(file);
    },
    [parseCSV]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleUpload = async () => {
    if (parsedLeads.length === 0) return;
    try {
      const result = await upload.mutateAsync(parsedLeads);
      trackEvent("leads_uploaded", {
        count: result.inserted,
        source: "csv",
        duplicates: result.duplicates,
      });
      onOpenChange(false);
      setParsedLeads([]);
      setFileName(null);
    } catch {
      // error handled by mutation state
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setParsedLeads([]);
    setFileName(null);
    setParseError(null);
    upload.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="font-heading">Upload Leads (CSV)</DialogTitle>
        </DialogHeader>

        {upload.isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto" />
            <p className="font-medium">Upload Complete</p>
            <div className="flex justify-center gap-2">
              <Badge variant="default">{upload.data.inserted} inserted</Badge>
              {upload.data.duplicates > 0 && (
                <Badge variant="secondary">
                  {upload.data.duplicates} duplicates skipped
                </Badge>
              )}
            </div>
          </div>
        ) : parsedLeads.length === 0 ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".csv";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFile(file);
              };
              input.click();
            }}
          >
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">
              Drop a CSV file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Required column: <code>name</code>. Optional: <code>phone</code>,{" "}
              <code>email</code>, <code>business_name</code>
            </p>
            {parseError && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {parseError}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              {fileName} — {parsedLeads.length} leads parsed
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-zinc-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-2 py-1.5 text-left font-medium">Name</th>
                    <th className="px-2 py-1.5 text-left font-medium">Phone</th>
                    <th className="px-2 py-1.5 text-left font-medium">Email</th>
                    <th className="px-2 py-1.5 text-left font-medium">Business</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedLeads.slice(0, 10).map((lead, i) => (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="px-2 py-1">{lead.name}</td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {lead.phone || "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {lead.email || "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {lead.business_name || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedLeads.length > 10 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  ...and {parsedLeads.length - 10} more
                </p>
              )}
            </div>
            {upload.isError && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {upload.error?.message || "Upload failed"}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!upload.isSuccess && parsedLeads.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700"
                onClick={() => {
                  setParsedLeads([]);
                  setFileName(null);
                }}
              >
                Change file
              </Button>
              <Button
                size="sm"
                onClick={handleUpload}
                disabled={upload.isPending}
              >
                {upload.isPending
                  ? "Uploading..."
                  : `Upload ${parsedLeads.length} leads`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
