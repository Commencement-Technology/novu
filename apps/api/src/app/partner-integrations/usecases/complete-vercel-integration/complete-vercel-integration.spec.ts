import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { expect } from 'chai';
import { stub, restore, assert } from 'sinon';
import { CommunityUserRepository, EnvironmentRepository, MemberRepository, OrganizationRepository } from '@novu/dal';
import { UserSession } from '@novu/testing';
import { of } from 'rxjs';
import { AnalyticsService } from '@novu/application-generic';

import { CompleteVercelIntegration } from './complete-vercel-integration.usecase';
import { Sync } from '../../../bridge/usecases/sync';
import { ApiException } from '../../../shared/exceptions/api.exception';

describe('CompleteVercelIntegration', function () {
  let completeVercelIntegration: CompleteVercelIntegration;
  let session: UserSession;
  let httpServiceMock;
  let environmentRepositoryMock;
  let organizationRepositoryMock;
  let analyticsServiceMock;
  let syncMock;
  let memberRepositoryMock;
  let communityUserRepositoryMock;

  beforeEach(async () => {
    // @ts-ignore
    process.env.VERCEL_BASE_URL = 'https://api.vercel.com';

    httpServiceMock = {
      get: stub().returns(
        of({
          data: {
            targets: {
              production: {
                alias: ['prod-alias.vercel.app'],
              },
              development: {
                alias: ['dev-alias.vercel.app'],
              },
            },
          },
        })
      ),
      post: stub().returns(of({ data: { success: true } })),
    };

    environmentRepositoryMock = {
      find: stub().resolves([
        {
          _id: 'env-id',
          name: 'Production',
          identifier: 'prod',
          _organizationId: 'org-id',
          apiKeys: [{ key: 'encrypted-key' }],
        },
        {
          _id: 'env-id-2',
          name: 'Development',
          identifier: 'dev',
          _organizationId: 'org-id',
          apiKeys: [{ key: 'encrypted-key-2' }],
        },
      ]),
    };

    organizationRepositoryMock = {
      findOne: stub().resolves({
        partnerConfigurations: [
          {
            configurationId: 'test-config-id',
            accessToken: 'test-token',
            teamId: 'test-team-id',
          },
        ],
      }),
      bulkUpdatePartnerConfiguration: stub().resolves(true),
    };

    analyticsServiceMock = {
      track: stub().resolves(),
    };

    syncMock = {
      execute: stub().resolves(),
    };

    memberRepositoryMock = {
      getOrganizationAdminAccount: stub().resolves({ _userId: 'admin-id' }),
    };

    communityUserRepositoryMock = {
      findOne: stub().resolves({ _id: 'internal-user-id' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CompleteVercelIntegration,
        { provide: HttpService, useValue: httpServiceMock },
        { provide: EnvironmentRepository, useValue: environmentRepositoryMock },
        { provide: OrganizationRepository, useValue: organizationRepositoryMock },
        { provide: AnalyticsService, useValue: analyticsServiceMock },
        { provide: Sync, useValue: syncMock },
        { provide: MemberRepository, useValue: memberRepositoryMock },
        { provide: CommunityUserRepository, useValue: communityUserRepositoryMock },
      ],
    }).compile();

    session = new UserSession();
    await session.initialize();
    completeVercelIntegration = moduleRef.get<CompleteVercelIntegration>(CompleteVercelIntegration);
  });

  afterEach(() => {
    restore();
  });

  it('should complete vercel integration successfully', async function () {
    const command = {
      userId: session.user._id,
      organizationId: session.organization._id,
      environmentId: session.environment._id,
      configurationId: 'test-config-id',
      data: {
        'org-id': ['project-1', 'project-2'],
      },
    };

    const result = await completeVercelIntegration.execute(command);

    expect(result.success).to.equal(true);

    // Verify organization repository calls
    assert.calledWith(organizationRepositoryMock.findOne, {
      _id: command.organizationId,
      'partnerConfigurations.configurationId': command.configurationId,
    });

    assert.calledWith(organizationRepositoryMock.bulkUpdatePartnerConfiguration, {
      userId: command.userId,
      data: command.data,
      configuration: {
        configurationId: 'test-config-id',
        accessToken: 'test-token',
        teamId: 'test-team-id',
      },
    });

    // Verify environment repository calls
    assert.calledWith(environmentRepositoryMock.find, {
      _organizationId: { $in: ['org-id'] },
    });

    // Verify environment variables setup
    assert.calledWith(
      httpServiceMock.post,
      'https://api.vercel.com/v10/projects/project-1/env?upsert=true&teamId=test-team-id',
      [
        {
          target: ['production'],
          type: 'encrypted',
          value: 'prod',
          key: 'NEXT_PUBLIC_NOVU_CLIENT_APP_ID',
        },
      ],
      {
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      }
    );

    // Verify bridge URL update
    assert.calledWith(httpServiceMock.get, 'https://api.vercel.com/v9/projects/project-1?teamId=test-team-id', {
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      },
    });

    // Verify sync execution
    assert.calledWith(syncMock.execute, {
      organizationId: 'org-id',
      userId: 'internal-user-id',
      environmentId: 'env-id',
      bridgeUrl: 'https://prod-alias.vercel.app/api/novu',
      source: 'vercel',
    });

    // Verify analytics
    assert.calledWith(
      analyticsServiceMock.track,
      'Create Vercel Integration - [Partner Integrations]',
      command.userId,
      { _organization: command.organizationId }
    );
  });

  it('should handle development environment setup', async function () {
    const command = {
      userId: session.user._id,
      organizationId: session.organization._id,
      environmentId: session.environment._id,
      configurationId: 'test-config-id',
      data: {
        'org-id': ['project-1'],
      },
    };

    environmentRepositoryMock.find.resolves([
      {
        _id: 'env-id',
        name: 'Development',
        identifier: 'dev',
        _organizationId: 'org-id',
        apiKeys: [{ key: 'encrypted-key' }],
      },
    ]);

    await completeVercelIntegration.execute(command);

    assert.calledWith(
      httpServiceMock.post,
      'https://api.vercel.com/v10/projects/project-1/env?upsert=true&teamId=test-team-id',
      [
        {
          target: ['preview', 'development'],
          type: 'encrypted',
          value: 'dev',
          key: 'NEXT_PUBLIC_NOVU_CLIENT_APP_ID',
        },
      ],
      {
        headers: {
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('should throw ApiException when configuration not found', async function () {
    organizationRepositoryMock.findOne.resolves(null);

    try {
      await completeVercelIntegration.execute({
        userId: session.user._id,
        organizationId: session.organization._id,
        environmentId: session.environment._id,
        configurationId: 'test-config-id',
        data: {},
      });
      throw new Error('Should not reach here');
    } catch (error) {
      expect(error).to.be.instanceOf(ApiException);
      assert.notCalled(organizationRepositoryMock.bulkUpdatePartnerConfiguration);
      assert.notCalled(environmentRepositoryMock.find);
      assert.notCalled(httpServiceMock.post);
      assert.notCalled(httpServiceMock.get);
      assert.notCalled(syncMock.execute);
      assert.notCalled(analyticsServiceMock.track);
    }
  });

  it('should handle errors during bridge URL update', async function () {
    httpServiceMock.get.throws(new Error('Failed to get domains'));

    const command = {
      userId: session.user._id,
      organizationId: session.organization._id,
      environmentId: session.environment._id,
      configurationId: 'test-config-id',
      data: {
        'org-id': ['project-1'],
      },
    };

    const result = await completeVercelIntegration.execute(command);

    expect(result.success).to.equal(true);
    assert.called(httpServiceMock.post); // Environment variables should still be set
    assert.notCalled(syncMock.execute); // Sync should not be called due to bridge URL error
  });
});
