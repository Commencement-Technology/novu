import type { IEnvironment } from '@novu/shared';

import { get, post, put } from './api.client';

const partnerIntegrationBaseUrl = '/partner-integrations';

export type GetVercelConfigurationDetails = {
  organizationId: string;
  projectIds: string[];
};

export type GetVercelProjects = {
  projects: {
    id: string;
    name: string;
  }[];
  pagination: {
    next: number;
  };
};

export async function vercelIntegrationSetup({
  code,
  configurationId,
  environment,
}: {
  code: string;
  configurationId: string;
  environment?: IEnvironment;
}): Promise<{ data: { success: boolean } }> {
  return post(`${partnerIntegrationBaseUrl}/vercel`, {
    body: { vercelIntegrationCode: code, configurationId },
    environment,
  });
}

export async function getVercelProjects({
  configurationId,
  environment,
}: {
  configurationId: string;
  environment?: IEnvironment;
}): Promise<{ data: GetVercelProjects }> {
  return get(`${partnerIntegrationBaseUrl}/vercel/projects/${configurationId}`, { environment });
}

export async function completeVercelIntegration({
  data,
  configurationId,
  environment,
}: {
  data: Record<string, string[]>;
  configurationId: string;
  environment?: IEnvironment;
}) {
  return post(`${partnerIntegrationBaseUrl}/vercel/configuration/complete`, {
    body: { data, configurationId },
    environment,
  });
}

export async function getVercelConfigurationDetails({
  configurationId,
  environment,
}: {
  configurationId?: string | null;
  environment?: IEnvironment;
}): Promise<{ data: GetVercelConfigurationDetails[] }> {
  return get(`${partnerIntegrationBaseUrl}/vercel/configuration/${configurationId}`, { environment });
}

export async function updateVercelIntegration({
  data,
  configurationId,
  environment,
}: {
  data: Record<string, string[]>;
  configurationId: string;
  environment?: IEnvironment;
}) {
  return put(`${partnerIntegrationBaseUrl}/vercel/configuration/update`, {
    body: { data, configurationId },
    environment,
  });
}
