import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, put, post, del } from '@/src/api';
import type { Week, User } from '@/src/constants';

/* ---------------- Schedule ---------------- */
export function useWeek(weekStart: string) {
  return useQuery<Week>({
    queryKey: ['week', weekStart],
    queryFn: () => get(`/api/schedule/${weekStart}`),
  });
}

export function useSummary(weekStart: string) {
  return useQuery({
    queryKey: ['summary', weekStart],
    queryFn: () => get(`/api/summary/${weekStart}`),
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => get('/api/settings'),
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: () => get('/api/people'),
  });
}

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => get('/api/meta'),
    staleTime: 1000 * 60 * 60,
  });
}

/* ---------------- Schedule mutations ---------------- */
export function useSaveWeek(weekStart: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Week>) => put(`/api/schedule/${weekStart}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['week', weekStart] });
      qc.invalidateQueries({ queryKey: ['summary', weekStart] });
    },
  });
}

export function useGenerateWeek(weekStart: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { hours: number; rotation: string; warehouse: string }) =>
      post(`/api/schedule/${weekStart}/generate`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['week', weekStart] });
      qc.invalidateQueries({ queryKey: ['summary', weekStart] });
    },
  });
}

export function useClearShift(weekStart: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shift: number) => post(`/api/schedule/${weekStart}/clear-shift`, { shift }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['week', weekStart] });
      qc.invalidateQueries({ queryKey: ['summary', weekStart] });
    },
  });
}

export function useLockWeek(weekStart: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locked: boolean) => post(`/api/schedule/${weekStart}/lock`, { locked }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['week', weekStart] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => get('/api/notifications'),
    enabled,
    refetchInterval: enabled ? 10000 : false,
  });
}

export function useRouteSummary(dateIso: string, enabled: boolean) {
  return useQuery({
    queryKey: ['route-summary', dateIso],
    queryFn: () => get(`/api/location/route-summary?date=${dateIso}`),
    enabled,
    refetchInterval: enabled ? 8000 : false,
  });
}

export function useMonthlySummary(year: number, month: number, enabled: boolean) {
  return useQuery({
    queryKey: ['summary-month', year, month],
    queryFn: () => get(`/api/summary/month/${year}/${month}`),
    enabled,
  });
}

/* ---------------- Settings ---------------- */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => put('/api/settings', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}

/* ---------------- Users (admin) ---------------- */
export function useUsers(enabled: boolean) {
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => get('/api/users'),
    enabled,
  });
}

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['users'] });
    qc.invalidateQueries({ queryKey: ['people'] });
    qc.invalidateQueries({ queryKey: ['summary'] });
  };
  const create = useMutation({ mutationFn: (b: any) => post('/api/users', b), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => put(`/api/users/${id}`, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/api/users/${id}`), onSuccess: invalidate });
  return { create, update, remove };
}

/* ---------------- Chat ---------------- */
export function useChat(enabled: boolean) {
  return useQuery({
    queryKey: ['chat'],
    queryFn: () => get('/api/chat'),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

export function usePostChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => post('/api/chat', { text }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat'] }),
  });
}

/* ---------------- Multi-week generation ---------------- */
export function useGenerateMulti() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      startWeek: string;
      count: number;
      hours: number;
      rotation: string;
      warehouse: string;
      alternateRotation: boolean;
    }) => post('/api/schedule/generate-multi', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['week'] });
      qc.invalidateQueries({ queryKey: ['summary'] });
    },
  });
}

/* ---------------- Vehicle location ---------------- */
export function useLatestLocation(enabled: boolean) {
  return useQuery({
    queryKey: ['location-latest'],
    queryFn: () => get('/api/location/latest'),
    enabled,
    refetchInterval: enabled ? 4000 : false,
  });
}

export function useLocationHistory(enabled: boolean) {
  return useQuery({
    queryKey: ['location-history'],
    queryFn: () => get('/api/location/history?limit=200'),
    enabled,
    refetchInterval: enabled ? 6000 : false,
  });
}

export function usePushLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { lat: number; lng: number; accuracy?: number; speed?: number }) =>
      post('/api/location', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['location-latest'] });
      qc.invalidateQueries({ queryKey: ['location-history'] });
    },
  });
}

/* ---------------- Shift swaps ---------------- */
export function useSwaps(enabled: boolean) {
  return useQuery({
    queryKey: ['swaps'],
    queryFn: () => get('/api/swaps'),
    enabled,
    refetchInterval: enabled ? 8000 : false,
  });
}

export function useSwapMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['swaps'] });
    qc.invalidateQueries({ queryKey: ['week'] });
    qc.invalidateQueries({ queryKey: ['summary'] });
  };
  const create = useMutation({
    mutationFn: (b: { weekStart: string; dayIndex: number; shift: number; note: string }) =>
      post('/api/swaps', b),
    onSuccess: invalidate,
  });
  const accept = useMutation({
    mutationFn: (id: string) => post(`/api/swaps/${id}/accept`),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => post(`/api/swaps/${id}/cancel`),
    onSuccess: invalidate,
  });
  return { create, accept, cancel };
}
