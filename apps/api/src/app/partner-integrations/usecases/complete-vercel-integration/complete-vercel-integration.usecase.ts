import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import {
  CommunityUserRepository,
  EnvironmentEntity,
  EnvironmentRepository,
  MemberRepository,
  OrganizationRepository,
} from '@novu/dal';
import { AnalyticsService, decryptApiKey } from '@novu/application-generic';

import { CompleteVercelIntegrationCommand } from './complete-vercel-integration.command';
import { ApiException } from '../../../shared/exceptions/api.exception';
import { Sync } from '../../../bridge/usecases/sync';

interface ISetEnvironment {
  name: string;
  token: string;
  projectIds: string[];
  teamId: string | null;
  applicationIdentifier: string;
  privateKey: string;
}

@Injectable()
export class CompleteVercelIntegration {
  constructor(
    private httpService: HttpService,
    private environmentRepository: EnvironmentRepository,
    private organizationRepository: OrganizationRepository,
    private analyticsService: AnalyticsService,
    private syncUsecase: Sync,
    private memberRepository: MemberRepository,
    private communityUserRepository: CommunityUserRepository
  ) {}

  async execute(command: CompleteVercelIntegrationCommand): Promise<{ success: boolean }> {
    try {
      const { data: orgIdsToProjectIds, userId, organizationId, configurationId } = command;
      const organizationIds = Object.keys(orgIdsToProjectIds);

      const configuration = await this.findPartnerConfigurationDetail({
        organizationId,
        configurationId,
      });

      await this.organizationRepository.bulkUpdatePartnerConfiguration({
        userId: command.userId,
        data: command.data,
        configuration,
      });

      const environments = await this.getEnvironments(organizationIds);

      for (const env of environments) {
        const projectIds = orgIdsToProjectIds[env._organizationId];
        await this.setEnvironmentVariables({
          name: env.name,
          applicationIdentifier: env.identifier,
          privateKey: decryptApiKey(env.apiKeys[0].key),
          projectIds,
          teamId: configuration.teamId,
          token: configuration.accessToken,
        });

        try {
          await this.updateBridgeUrl(
            env._id,
            env.name,
            projectIds[0],
            configuration.accessToken,
            configuration.teamId,
            env._organizationId
          );
        } catch (error) {
          Logger.error(error, 'Error updating bridge url');
        }
      }

      this.analyticsService.track('Create Vercel Integration - [Partner Integrations]', userId, {
        _organization: organizationId,
      });

      return {
        success: true,
      };
    } catch (error) {
      Logger.error(error);
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

  private async updateBridgeUrl(
    environmentId: string,
    environmentName: string,
    projectId: string,
    accessToken: string,
    teamId: string,
    organizationId: string
  ) {
    try {
      const getDomainsResponse = await lastValueFrom(
        this.httpService.get(`${process.env.VERCEL_BASE_URL}/v9/projects/${projectId}?teamId=${teamId}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })
      );

      const vercelAvailableTargets = getDomainsResponse.data?.targets;
      let vercelTarget;
      if (environmentName.toLowerCase() === 'production') {
        vercelTarget = vercelAvailableTargets?.production;
      } else {
        vercelTarget = vercelAvailableTargets?.development;
      }
      const alias = vercelTarget?.alias?.sort((a, b) => a.length - b.length)[0];
      const bridgeUrl = alias || vercelTarget?.meta?.branchAlias || vercelTarget?.automaticAliases[0];

      if (!bridgeUrl) {
        return;
      }

      const fullBridgeUrl = `https://${bridgeUrl}/api/novu`;

      const orgAdmin = await this.memberRepository.getOrganizationAdminAccount(organizationId);
      if (!orgAdmin) {
        throw new ApiException('Organization admin not found');
      }

      const internalUser = await this.communityUserRepository.findOne({ externalId: orgAdmin?._userId });

      if (!internalUser) {
        throw new ApiException('User not found');
      }

      await this.syncUsecase.execute({
        organizationId,
        userId: internalUser?._id as string,
        environmentId,
        bridgeUrl: fullBridgeUrl,
        source: 'vercel',
      });
    } catch (error) {
      Logger.error(error, 'Error updating bridge url');
    }
  }

  private async getEnvironments(organizationIds: string[]): Promise<EnvironmentEntity[]> {
    return await this.environmentRepository.find(
      {
        _organizationId: { $in: organizationIds },
      },
      'apiKeys identifier name _organizationId _id'
    );
  }

  private async setEnvironmentVariables({
    name,
    applicationIdentifier,
    projectIds,
    privateKey,
    teamId,
    token,
  }: ISetEnvironment): Promise<void> {
    const target = name?.toLowerCase() === 'production' ? ['production'] : ['preview', 'development'];
    const type = 'encrypted';

    const environmentVariables = [
      {
        target,
        type,
        value: applicationIdentifier,
        key: 'NEXT_PUBLIC_NOVU_CLIENT_APP_ID',
      },
      {
        target,
        type,
        value: applicationIdentifier,
        key: 'NOVU_CLIENT_APP_ID',
      },
      {
        target,
        type,
        value: privateKey,
        key: 'NOVU_SECRET_KEY',
      },
    ];

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const getUrl = (projectId: string) => {
      const baseUrl = `${process.env.VERCEL_BASE_URL}/v10/projects/${projectId}/env`;
      const queryParams = new URLSearchParams();
      queryParams.set('upsert', 'true');

      if (teamId) {
        queryParams.set('teamId', teamId);
      }

      return `${baseUrl}?${queryParams.toString()}`;
    };

    const setEnvVariable = async (projectId: string, variable: (typeof environmentVariables)[0]) => {
      try {
        await lastValueFrom(this.httpService.post(getUrl(projectId), [variable], { headers }));
      } catch (error) {
        throw new ApiException(error.response?.data?.error || error.response?.data);
      }
    };

    await Promise.all(
      projectIds.flatMap((projectId) => environmentVariables.map((variable) => setEnvVariable(projectId, variable)))
    );
  }
}
