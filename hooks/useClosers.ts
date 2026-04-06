import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useClosers() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["closers"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name");
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
}
