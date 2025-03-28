import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { OrganizationRepository } from '@novu/dal';

import { ApiException } from '../../../shared/exceptions/api.exception';
import { UpdateVercelConfigurationCommand } from './update-vercel-configuration.command';
import { CompleteVercelIntegration } from '../complete-vercel-integration/complete-vercel-integration.usecase';
import { CompleteVercelIntegrationCommand } from '../complete-vercel-integration/complete-vercel-integration.command';

interface IRemoveEnvironment {
  vercelLinkedProjects: ProjectDetails[];
  token: string;
  teamId: string | null;
}

type ProjectDetails = {
  projectId: string;
  clientAppIdEnv?: string;
  secretKeyEnv?: string;
  nextClientAppIdEnv?: string;
};

@Injectable()
export class UpdateVercelConfiguration {
  constructor(
    private httpService: HttpService,
    private completeVercelIntegration: CompleteVercelIntegration,
    private organizationRepository: OrganizationRepository
  ) {}

  async execute(command: UpdateVercelConfigurationCommand): Promise<{ success: boolean }> {
    try {
      const { organizationId, configurationId } = command;

      const configuration = await this.findPartnerConfigurationDetail({
        organizationId,
        configurationId,
      });

      const organizationsWithConfiguration = await this.organizationRepository.findPartnerConfigurationDetails({
        userId: command.userId,
        configurationId: command.configurationId,
      });

      const allOldProjectIds = [
        ...new Set(
          organizationsWithConfiguration.reduce<string[]>((acc, org) => {
            return acc.concat(org.partnerConfigurations?.[0].projectIds || []);
          }, [])
        ),
      ];

      const vercelLinkedProjects = await this.getVercelLinkedProjects(
        configuration.accessToken,
        configuration.teamId,
        allOldProjectIds
      );

      await this.removeEnvironmentVariables({
        vercelLinkedProjects,
        teamId: configuration.teamId,
        token: configuration.accessToken,
      });

      await this.completeVercelIntegration.execute(
        CompleteVercelIntegrationCommand.create({
          ...command,
        })
      );

      return { success: true };
    } catch (error) {
      throw new ApiException(error.message);
    }
  }

  async findPartnerConfigurationDetail({
    organizationId,
    configurationId,
  }: {
    organizationId: string;
    configurationId: string;
  }) {
    const organization = await this.organizationRepository.findOne(
      {
        _id: organizationId,
        'partnerConfigurations.configurationId': configurationId,
      },
      { 'partnerConfigurations.$': 1 }
    );

    const configuration = organization?.partnerConfigurations?.find(
      (config) => config.configurationId === configurationId
    );
    if (!organization || !organization.partnerConfigurations?.length || !configuration) {
      throw new BadRequestException('No configuration found for vercel');
    }

    return configuration;
  }

  private async getVercelLinkedProjects(
    accessToken: string,
    teamId: string | null,
    allOldProjectIds: string[]
  ): Promise<ProjectDetails[]> {
    const response = await lastValueFrom(
      this.httpService.get(`${process.env.VERCEL_BASE_URL}/v4/projects${teamId ? `?teamId=${teamId}` : ''}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    );
    const vercelProjects = response.data.projects as any[];
    const filteredVercelProjects = vercelProjects.filter((project) => allOldProjectIds.includes(project.id));

    return filteredVercelProjects.map<ProjectDetails>((project) => {
      const { id } = project;
      const vercelEnvs = project?.env;
      const nextClientAppIdEnv = vercelEnvs?.find((e) => e.key === 'NEXT_PUBLIC_NOVU_CLIENT_APP_ID');
      const clientAppIdEnv = vercelEnvs?.find((e) => e.key === 'NOVU_CLIENT_APP_ID');
      const secretKeyEnv = vercelEnvs?.find((e) => e.key === 'NOVU_SECRET_KEY');

      return {
        projectId: id,
        clientAppIdEnv: clientAppIdEnv?.id,
        secretKeyEnv: secretKeyEnv?.id,
        nextClientAppIdEnv: nextClientAppIdEnv?.id,
      };
    });
  }

  private async removeEnvironmentVariables({ vercelLinkedProjects, teamId, token }: IRemoveEnvironment): Promise<void> {
    const projectApiUrl = `${process.env.VERCEL_BASE_URL}/v9/projects`;

    await Promise.all(
      vercelLinkedProjects.map((detail) => {
        const urls: string[] = [];
        if (detail.nextClientAppIdEnv) {
          urls.push(
            `${projectApiUrl}/${detail.projectId}/env/${detail.nextClientAppIdEnv}${teamId ? `?teamId=${teamId}` : ''}`
          );
        }

        if (detail.clientAppIdEnv) {
          urls.push(
            `${projectApiUrl}/${detail.projectId}/env/${detail.clientAppIdEnv}${teamId ? `?teamId=${teamId}` : ''}`
          );
        }

        if (detail.secretKeyEnv) {
          urls.push(
            `${projectApiUrl}/${detail.projectId}/env/${detail.secretKeyEnv}${teamId ? `?teamId=${teamId}` : ''}`
          );
        }

        const requests = urls.map((url) =>
          lastValueFrom(
            this.httpService.delete(url, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            })
          )
        );

        return Promise.all(requests);
      })
    );
  }
}
