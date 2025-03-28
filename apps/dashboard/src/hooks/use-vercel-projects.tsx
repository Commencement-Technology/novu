import { useQuery } from '@tanstack/react-query';

import { getVercelProjects } from '@/api/partner-integrations';
import { useEnvironment } from '@/context/environment/hooks';

export function useVercelProjects({
  configurationId,
  enabled = true,
}: {
  configurationId?: string | null;
  enabled?: boolean;
}) {
  const { currentEnvironment } = useEnvironment();

  return useQuery({
    queryKey: ['vercelProjects', configurationId],
    queryFn: async () => {
      const response = await getVercelProjects({
        configurationId: configurationId as string,
        environment: currentEnvironment,
      });

      return response.data;
    },
    enabled: !!configurationId && !!currentEnvironment && enabled,
  });
}
