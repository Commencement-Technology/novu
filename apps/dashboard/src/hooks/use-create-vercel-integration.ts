import { useMutation } from '@tanstack/react-query';

import { completeVercelIntegration } from '@/api/partner-integrations';
import { showErrorToast } from '@/components/primitives/sonner-helpers';
import { useEnvironment } from '@/context/environment/hooks';

export const useCreateVercelIntegration = ({ next }: { next?: string | null }) => {
  const { currentEnvironment } = useEnvironment();

  return useMutation({
    mutationFn: ({ data, configurationId }: { data: Record<string, string[]>; configurationId: string }) =>
      completeVercelIntegration({ data, configurationId, environment: currentEnvironment }),
    onSuccess: () => {
      if (next) {
        window.location.replace(next);
      }
    },
    onError: (err: any) => {
      if (err?.message) {
        showErrorToast(`Failed to create Vercel integration: ${err?.message}`);
      }
    },
  });
};
