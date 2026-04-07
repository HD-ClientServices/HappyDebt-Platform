"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoreHorizontal } from "lucide-react";
import { trackEvent } from "@/lib/plg";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";

type ActionableStatus = "pending" | "in_progress" | "done" | "dismissed";

export function ActionablesBoard() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState("medium");

  const { data: actionables, isLoading } = useQuery({
    queryKey: ["actionables", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("actionables")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      id,
      from,
      to,
    }: {
      id: string;
      from: string;
      to: ActionableStatus;
    }) => {
      await supabase
        .from("actionables")
        .update({ status: to })
        .eq("id", id)
        .eq("org_id", orgId!);
      trackEvent("actionable_status_changed", { from, to });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actionables", orgId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from("actionables")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actionables", orgId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (!orgId) throw new Error("No org");

      await supabase.from("actionables").insert({
        title: newTitle,
        description: newDescription || null,
        priority: newPriority,
        status: "pending",
        user_id: user.id,
        org_id: orgId,
        source_type: "manual",
      });
      trackEvent("actionable_created", { source: "manual" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["actionables", orgId] });
      setNewDialogOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewPriority("medium");
    },
  });

  const byStatus = {
    pending: (actionables ?? []).filter((a) => a.status === "pending"),
    in_progress: (actionables ?? []).filter((a) => a.status === "in_progress"),
    done: (actionables ?? []).filter((a) => a.status === "done"),
    dismissed: (actionables ?? []).filter((a) => a.status === "dismissed"),
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  const handleDelete = (id: string) => {
    if (window.confirm("Delete this actionable? This cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  const statusOptions: { label: string; value: ActionableStatus }[] = [
    { label: "Move to Pending", value: "pending" },
    { label: "Move to In Progress", value: "in_progress" },
    { label: "Move to Done", value: "done" },
  ];

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["pending", "in_progress", "done"] as const).map((status) => (
          <Card key={status} className="bg-zinc-900/80 border-zinc-800">
            <CardContent className="p-4">
              <h2 className="font-heading font-medium mb-3 capitalize">
                {status.replace("_", " ")}
              </h2>
              <div className="space-y-2">
                {byStatus[status].length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  byStatus[status].map((a) => (
                    <div
                      key={a.id}
                      className="rounded-lg border border-zinc-800 p-3 text-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{a.title}</p>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {statusOptions
                              .filter((opt) => opt.value !== status)
                              .map((opt) => (
                                <DropdownMenuItem
                                  key={opt.value}
                                  onClick={() =>
                                    statusMutation.mutate({
                                      id: a.id,
                                      from: status,
                                      to: opt.value,
                                    })
                                  }
                                >
                                  {opt.label}
                                </DropdownMenuItem>
                              ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-rose-500 focus:text-rose-400"
                              onClick={() => handleDelete(a.id)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {a.priority}
                        </Badge>
                        {a.source_type && (
                          <Badge variant="outline" className="text-xs">
                            {a.source_type}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full border-zinc-700"
                onClick={() => setNewDialogOpen(true)}
              >
                New
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New actionable dialog */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Create actionable
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTitle.trim()) return;
              createMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="actionable-title">Title *</Label>
              <Input
                id="actionable-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What needs to be done?"
                required
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actionable-description">Description</Label>
              <Textarea
                id="actionable-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Optional details…"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actionable-priority">Priority</Label>
              <Select value={newPriority} onValueChange={setNewPriority}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewDialogOpen(false)}
                className="border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!newTitle.trim() || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
