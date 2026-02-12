import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client.ts';
import { useAuthStatus } from '../../hooks/useApi.ts';

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useAuthStatus();

  const loginMutation = useMutation({
    mutationFn: (data: { username: string; password: string; sharedSecret?: string }) =>
      api.auth.login(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-status'] });
    },
  });

  const steamGuardMutation = useMutation({
    mutationFn: (code: string) => api.auth.steamGuard(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-status'] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-status'] });
      queryClient.clear();
    },
  });

  return {
    status,
    isLoading,
    isLoggedIn: status?.isLoggedIn ?? false,
    login: loginMutation,
    steamGuard: steamGuardMutation,
    logout: logoutMutation,
  };
}
