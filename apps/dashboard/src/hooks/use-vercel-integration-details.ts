import { useQuery, UseQueryOptions } from '@tanstack/react-query';

import { getVercelConfigurationDetails, GetVercelConfigurationDetails } from '@/api/partner-integrations';
import { useEnvironment } from '@/context/environment/hooks';

export function useVercelIntegrationDetails({
  configurationId,
  options,
}: {
  configurationId?: string | null;
  options?: Omit<UseQueryOptions<GetVercelConfigurationDetails[], Error>, 'queryKey' | 'queryFn'>;
}) {
  const { currentEnvironment } = useEnvironment();

  return useQuery({
    queryKey: ['configurationDetails', configurationId],
    queryFn: async () => {
      const response = await getVercelConfigurationDetails({ configurationId, environment: currentEnvironment });

      return response.data;
    },
    ...options,
  });
}
