"use client";

import { useEffect, useState } from "react";

/**
 * Returns a debounced version of the input value that only updates
 * after `delay` ms have passed without changes.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
