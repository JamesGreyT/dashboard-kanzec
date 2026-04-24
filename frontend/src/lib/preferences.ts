/**
 * User preferences — stored server-side at /api/preferences, cached
 * locally. Dashboards read this on mount to pre-seed filter state,
 * so an operator lands on their own book (manager/direction/region)
 * without touching a filter. Admin users typically leave it empty
 * and see all.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export interface UserPreferences {
  default_window?: string;        // alias: "today" / "last7" / "last30" / "last90" / "mtd" / "qtd" / "ytd" / "fy"
  default_directions?: string[];
  default_manager?: string[];
  default_region?: string[];
}

export function usePreferences() {
  return useQuery({
    queryKey: ["user.preferences"],
    queryFn: () => api<UserPreferences>("/api/preferences"),
    staleTime: 10 * 60_000,  // 10 minutes — these change rarely
    gcTime: 30 * 60_000,
  });
}

export function useSavePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserPreferences) =>
      api<UserPreferences>("/api/preferences", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user.preferences"] }),
  });
}
