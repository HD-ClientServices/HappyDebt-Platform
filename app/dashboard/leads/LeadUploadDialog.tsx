"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
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
  _errors?: string[];
  _warnings?: string[];
}

// Lightweight validators
const PHONE_REGEX = /^[+]?[\d\s().-]{7,20}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateLead(lead: ParsedLead, phoneCount: Map<string, number>): {
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name is required and must be at least 2 chars
  if (!lead.name || lead.name.trim().length < 2) {
    errors.push("Name is missing or too short");
  }

  // Phone format
  if (lead.phone && lead.phone.trim().length > 0) {
    if (!PHONE_REGEX.test(lead.phone.trim())) {
      warnings.push("Phone format looks invalid");
    }
    const normalized = lead.phone.replace(/\D/g, "");
    if (normalized && (phoneCount.get(normalized) ?? 0) > 1) {
      errors.push("Duplicate phone in this file");
    }
  }

  // Email format
  if (lead.email && lead.email.trim().length > 0) {
    if (!EMAIL_REGEX.test(lead.email.trim())) {
      warnings.push("Email format looks invalid");
    }
  }

  // Must have at least phone or email
  if (!lead.phone && !lead.email) {
    warnings.push("No phone or email — hard to contact");
  }

  return { errors, warnings };
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
          const rawLeads = parseCSV(text);

          // Build phone frequency map for duplicate detection
          const phoneCount = new Map<string, number>();
          for (const lead of rawLeads) {
            if (lead.phone) {
              const normalized = lead.phone.replace(/\D/g, "");
              if (normalized) {
                phoneCount.set(normalized, (phoneCount.get(normalized) ?? 0) + 1);
              }
            }
          }

          // Validate each lead
          const validated = rawLeads.map((lead) => {
            const { errors, warnings } = validateLead(lead, phoneCount);
            return { ...lead, _errors: errors, _warnings: warnings };
          });

          setParsedLeads(validated);
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

  const stats = useMemo(() => {
    const errorCount = parsedLeads.filter((l) => (l._errors?.length ?? 0) > 0).length;
    const warningCount = parsedLeads.filter(
      (l) => (l._warnings?.length ?? 0) > 0 && (l._errors?.length ?? 0) === 0
    ).length;
    const valid = parsedLeads.length - errorCount;
    return { errorCount, warningCount, valid };
  }, [parsedLeads]);

  const handleUpload = async () => {
    if (parsedLeads.length === 0) return;

    // Strip validation metadata and exclude rows with errors
    const cleanLeads = parsedLeads
      .filter((l) => (l._errors?.length ?? 0) === 0)
      .map(({ _errors, _warnings, ...rest }) => {
        void _errors;
        void _warnings;
        return rest;
      });

    if (cleanLeads.length === 0) return;

    try {
      const result = await upload.mutateAsync(cleanLeads);
      trackEvent("leads_uploaded", {
        count: result.inserted,
        source: "csv",
        duplicates: result.duplicates,
        errors: stats.errorCount,
        warnings: stats.warningCount,
      });
      onOpenChange(false);
      setParsedLeads([]);
      setFileName(null);
    } catch {
      // error handled by mutation state
    }
  };

  const handleClose = () => {
    // T7: Track abandonment if user had parsed leads but didn't confirm upload
    if (parsedLeads.length > 0 && !upload.isSuccess) {
      trackEvent("leads_upload_abandoned", {
        parsed_count: parsedLeads.length,
        errors: stats.errorCount,
        warnings: stats.warningCount,
      });
    }

    onOpenChange(false);
    setParsedLeads([]);
    setFileName(null);
    setParseError(null);
    upload.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
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
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                {fileName} — {parsedLeads.length} parsed
              </div>
              <div className="flex gap-2">
                {stats.valid > 0 && (
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border-emerald-900/50">
                    {stats.valid} valid
                  </Badge>
                )}
                {stats.warningCount > 0 && (
                  <Badge variant="secondary" className="bg-amber-500/10 text-amber-400 border-amber-900/50">
                    {stats.warningCount} warnings
                  </Badge>
                )}
                {stats.errorCount > 0 && (
                  <Badge variant="destructive">
                    {stats.errorCount} errors
                  </Badge>
                )}
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-zinc-950">
                  <tr className="border-b border-zinc-800">
                    <th className="px-2 py-1.5 text-left font-medium w-6" />
                    <th className="px-2 py-1.5 text-left font-medium">Name</th>
                    <th className="px-2 py-1.5 text-left font-medium">Phone</th>
                    <th className="px-2 py-1.5 text-left font-medium">Email</th>
                    <th className="px-2 py-1.5 text-left font-medium">Business</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedLeads.slice(0, 50).map((lead, i) => {
                    const hasError = (lead._errors?.length ?? 0) > 0;
                    const hasWarning = (lead._warnings?.length ?? 0) > 0;
                    const tooltip = [...(lead._errors ?? []), ...(lead._warnings ?? [])].join(" · ");
                    return (
                      <tr
                        key={i}
                        className={
                          hasError
                            ? "border-b border-zinc-800/50 bg-red-950/20"
                            : hasWarning
                              ? "border-b border-zinc-800/50 bg-amber-950/10"
                              : "border-b border-zinc-800/50"
                        }
                        title={tooltip || undefined}
                      >
                        <td className="px-2 py-1">
                          {hasError ? (
                            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                          ) : hasWarning ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/60" />
                          )}
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
              {parsedLeads.length > 50 && (
                <p className="px-2 py-1.5 text-xs text-muted-foreground border-t border-zinc-800">
                  ...and {parsedLeads.length - 50} more rows (validation applied to all)
                </p>
              )}
            </div>

            {stats.errorCount > 0 && (
              <div className="flex items-start gap-2 text-xs text-red-400 rounded-md bg-red-950/20 border border-red-900/50 p-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Rows with errors will be skipped. Fix your CSV to upload them.
                </span>
              </div>
            )}

            {upload.isError && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="h-4 w-4" />
                {upload.error?.message || "Upload failed"}
              </div>
            )}
          </div>
        )}

        {!upload.isSuccess && parsedLeads.length > 0 && (
          <DialogFooter>
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
              disabled={upload.isPending || stats.valid === 0}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {upload.isPending
                ? "Uploading..."
                : `Upload ${stats.valid} lead${stats.valid !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
