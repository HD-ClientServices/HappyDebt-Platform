"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { cn } from "@/lib/utils";

export interface DrillDownColumnDef<T> {
  id: string;
  header: string;
  cell?: (row: T) => React.ReactNode;
  accessorKey?: keyof T;
}

export interface DrillDownConfig<T extends Record<string, unknown>> {
  title: string;
  description?: string;
  columns: DrillDownColumnDef<T>[];
  data: T[];
  showAudioPlayer?: boolean;
  /** Key in T for recording URL (e.g. 'recording_url') */
  recordingUrlKey?: keyof T;
  /** Key in T for call/record id (e.g. 'id') */
  recordIdKey?: keyof T;
  showSaveActionable?: boolean;
  onSaveActionable?: (row: T) => void;
  onExportCSV?: () => void;
}

interface DrillDownModalProps<T extends Record<string, unknown>> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: DrillDownConfig<T> | null;
}

function getCellValue<T>(row: T, key: keyof T): unknown {
  const v = row[key];
  return v;
}

export function DrillDownModal<T extends Record<string, unknown>>({
  open,
  onOpenChange,
  config,
}: DrillDownModalProps<T>) {
  if (!config) return null;

  const {
    title,
    description,
    columns,
    data,
    showAudioPlayer,
    recordingUrlKey = "recording_url" as keyof T,
    recordIdKey = "id" as keyof T,
    showSaveActionable,
    onSaveActionable,
    onExportCSV,
  } = config;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          {description && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="overflow-auto flex-1 border border-zinc-800 rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 bg-zinc-900/50 sticky top-0">
                {columns.map((col) => (
                  <TableHead key={col.id} className="font-medium">
                    {col.header}
                  </TableHead>
                ))}
                {showAudioPlayer && (
                  <TableHead className="w-[200px]">Audio</TableHead>
                )}
                {showSaveActionable && <TableHead className="w-[120px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={
                      columns.length +
                      (showAudioPlayer ? 1 : 0) +
                      (showSaveActionable ? 1 : 0)
                    }
                    className="text-center text-muted-foreground py-8"
                  >
                    No records
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, idx) => (
                  <TableRow
                    key={String(recordIdKey ? row[recordIdKey] : idx)}
                    className={cn(
                      "border-zinc-800",
                      idx % 2 === 1 && "bg-zinc-950/50"
                    )}
                  >
                    {columns.map((col) => (
                      <TableCell key={col.id}>
                        {col.cell
                          ? col.cell(row)
                          : String(
                              getCellValue(
                                row,
                                (col.accessorKey ?? col.id) as keyof T
                              ) ?? ""
                            )}
                      </TableCell>
                    ))}
                    {showAudioPlayer && (
                      <TableCell>
                        {row[recordingUrlKey] ? (
                          <CallAudioPlayer
                            recordingUrl={String(row[recordingUrlKey])}
                            callId={String(row[recordIdKey] ?? "")}
                          />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    )}
                    {showSaveActionable && onSaveActionable && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSaveActionable(row)}
                        >
                          Save as Actionable
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter showCloseButton>
          {onExportCSV && (
            <Button variant="outline" onClick={onExportCSV}>
              Export CSV
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
