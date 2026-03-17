"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  title: string;
  value: string | number;
  /** Optional sparkline or trend (e.g. "+12%" with arrow) */
  subtitle?: string;
  /** "positive" | "negative" | "neutral" for trend color */
  trend?: "positive" | "negative" | "neutral";
  /** Optional small chart or indicator (React node) */
  sparkline?: React.ReactNode;
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  trend = "neutral",
  sparkline,
  className,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        "bg-card backdrop-blur-sm border-border rounded-xl",
        className
      )}
    >
      <CardHeader className="pb-1">
        <p className="text-sm font-medium text-muted-foreground font-sans">
          {title}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-2xl font-bold font-heading tabular-nums">{value}</p>
        {subtitle && (
          <p
            className={cn(
              "text-xs font-medium",
              trend === "positive" && "text-success",
              trend === "negative" && "text-destructive",
              trend === "neutral" && "text-muted-foreground"
            )}
          >
            {subtitle}
          </p>
        )}
        {sparkline && <div className="mt-2 h-8">{sparkline}</div>}
      </CardContent>
    </Card>
  );
}
