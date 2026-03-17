"use client";

import { useState, useRef, useEffect } from "react";
import { format, addMonths, subMonths } from "date-fns";
import { DayPicker, DateRange, getDefaultClassNames } from "react-day-picker";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

interface Props {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

const calendarClassNames = (defaults: ReturnType<typeof getDefaultClassNames>) => ({
  today: "text-blue-400 font-semibold",
  selected: "bg-blue-600 text-white rounded-md",
  range_start: "bg-blue-600 text-white rounded-l-md",
  range_end: "bg-blue-600 text-white rounded-r-md",
  range_middle: "bg-blue-600/20 text-blue-200",
  chevron: "fill-zinc-400",
  root: `${defaults.root} text-zinc-300`,
  day: `${defaults.day} hover:bg-zinc-700 rounded-md transition-colors`,
  months: defaults.months,
  weekday: `${defaults.weekday} text-zinc-500 text-xs`,
  outside: "text-zinc-600 opacity-40",
  disabled: "text-zinc-700 opacity-40",
  nav: "hidden",
  footer: "hidden",
  month_caption: "hidden",
});

/**
 * Helper to ensure left is always at least 1 month before right.
 * If they'd overlap, push the other panel.
 */
function ensureGap(
  left: Date,
  right: Date,
  changed: "left" | "right"
): { left: Date; right: Date } {
  const leftKey = left.getFullYear() * 12 + left.getMonth();
  const rightKey = right.getFullYear() * 12 + right.getMonth();

  if (leftKey >= rightKey) {
    if (changed === "left") {
      // Left moved forward too far — push right ahead
      return { left, right: addMonths(left, 1) };
    } else {
      // Right moved backward too far — push left back
      return { left: subMonths(right, 1), right };
    }
  }
  return { left, right };
}

export function DateRangePicker({ dateRange, onDateRangeChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const defaultClassNames = getDefaultClassNames();

  const now = new Date();

  // Initialize: left = from's month (or prev month), right = to's month (or current month)
  // Ensure they're never the same month
  const initLeft = dateRange.from
    ? new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const initRight = dateRange.to
    ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const init = ensureGap(initLeft, initRight, "right");

  const [leftMonth, setLeftMonth] = useState(init.left);
  const [rightMonth, setRightMonth] = useState(init.right);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  // Navigation handlers with gap enforcement
  const navigateLeft = (direction: 1 | -1) => {
    const newLeft = direction === 1 ? addMonths(leftMonth, 1) : subMonths(leftMonth, 1);
    const fixed = ensureGap(newLeft, rightMonth, "left");
    setLeftMonth(fixed.left);
    setRightMonth(fixed.right);
  };

  const navigateRight = (direction: 1 | -1) => {
    const newRight = direction === 1 ? addMonths(rightMonth, 1) : subMonths(rightMonth, 1);
    const fixed = ensureGap(leftMonth, newRight, "right");
    setLeftMonth(fixed.left);
    setRightMonth(fixed.right);
  };

  const label =
    dateRange.from && dateRange.to
      ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d, yyyy")}`
      : dateRange.from
        ? `${format(dateRange.from, "MMM d, yyyy")} - ...`
        : "Select dates";

  const presets = [
    {
      label: "This month",
      getRange: (): DateRange => {
        const n = new Date();
        return {
          from: new Date(n.getFullYear(), n.getMonth(), 1),
          to: n,
        };
      },
    },
    {
      label: "Last month",
      getRange: (): DateRange => {
        const n = new Date();
        return {
          from: new Date(n.getFullYear(), n.getMonth() - 1, 1),
          to: new Date(n.getFullYear(), n.getMonth(), 0),
        };
      },
    },
    {
      label: "Last 7 days",
      getRange: (): DateRange => {
        const n = new Date();
        const f = new Date(n);
        f.setDate(f.getDate() - 6);
        return { from: f, to: n };
      },
    },
    {
      label: "Last 30 days",
      getRange: (): DateRange => {
        const n = new Date();
        const f = new Date(n);
        f.setDate(f.getDate() - 29);
        return { from: f, to: n };
      },
    },
  ];

  const handlePreset = (preset: (typeof presets)[number]) => {
    const range = preset.getRange();
    onDateRangeChange(range);
    // Set calendars to show the range, ensuring gap
    const pLeft = range.from
      ? new Date(range.from.getFullYear(), range.from.getMonth(), 1)
      : leftMonth;
    const pRight = range.to
      ? new Date(range.to.getFullYear(), range.to.getMonth(), 1)
      : rightMonth;
    const fixed = ensureGap(pLeft, pRight, "right");
    setLeftMonth(fixed.left);
    setRightMonth(fixed.right);
    setOpen(false);
  };

  const handleSelect = (range: DateRange | undefined) => {
    if (range) onDateRangeChange(range);
  };

  const sharedClassNames = calendarClassNames(defaultClassNames);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:border-zinc-600",
          open && "border-zinc-500 bg-zinc-800"
        )}
      >
        <CalendarDays className="h-4 w-4 text-zinc-500" />
        {label}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-zinc-500 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 flex rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/50">
          {/* Presets sidebar */}
          <div className="flex flex-col border-r border-zinc-800 p-3 gap-1 min-w-[140px]">
            <span className="px-2 py-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Quick select
            </span>
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handlePreset(preset)}
                className="rounded-md px-2 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Calendars + footer column */}
          <div className="flex flex-col">
            <div className="p-3 flex gap-4">
              {/* Left calendar */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    onClick={() => navigateLeft(-1)}
                    className="rounded-md p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium text-zinc-200">
                    {format(leftMonth, "MMMM yyyy")}
                  </span>
                  <button
                    onClick={() => navigateLeft(1)}
                    className="rounded-md p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <DayPicker
                  mode="range"
                  selected={dateRange}
                  onSelect={handleSelect}
                  month={leftMonth}
                  onMonthChange={setLeftMonth}
                  hideNavigation
                  classNames={sharedClassNames}
                />
              </div>

              {/* Divider */}
              <div className="w-px bg-zinc-800" />

              {/* Right calendar */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2 px-1">
                  <button
                    onClick={() => navigateRight(-1)}
                    className="rounded-md p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium text-zinc-200">
                    {format(rightMonth, "MMMM yyyy")}
                  </span>
                  <button
                    onClick={() => navigateRight(1)}
                    className="rounded-md p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <DayPicker
                  mode="range"
                  selected={dateRange}
                  onSelect={handleSelect}
                  month={rightMonth}
                  onMonthChange={setRightMonth}
                  hideNavigation
                  classNames={sharedClassNames}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-3 py-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
