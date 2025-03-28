import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';
import { OrganizationRepository } from '@novu/dal';

import { GetVercelProjectsCommand } from './get-vercel-projects.command';
import { ApiException } from '../../../shared/exceptions/api.exception';

@Injectable()
export class GetVercelProjects {
  constructor(
    private httpService: HttpService,
    private organizationRepository: OrganizationRepository
  ) {}

  async execute(command: GetVercelProjectsCommand) {
    try {
      const configuration = await this.findPartnerConfigurationDetail({
        organizationId: command.organizationId,
        configurationId: command.configurationId,
      });

      if (!configuration || !configuration.accessToken) {
        throw new UnauthorizedException();
      }

      const projects = await this.getVercelProjects(configuration.accessToken, configuration.teamId, command.nextPage);

      return projects;
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

  private async getVercelProjects(accessToken: string, teamId: string | null, until?: string) {
    const queryParams = new URLSearchParams();
    queryParams.set('limit', '100');

    if (teamId) {
      queryParams.set('teamId', teamId);
    }

    if (until) {
      queryParams.set('until', until);
    }

    const response = await lastValueFrom(
      this.httpService.get(`${process.env.VERCEL_BASE_URL}/v10/projects?${queryParams.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    );

    return { projects: this.mapProjects(response.data.projects), pagination: response.data.pagination };
  }

  private mapProjects(projects) {
    return projects.map((project) => {
      return {
        name: project.name,
        id: project.id,
      };
    });
  }
}
