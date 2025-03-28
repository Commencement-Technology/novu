import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { expect } from 'chai';
import { stub, restore, assert } from 'sinon';
import { OrganizationRepository } from '@novu/dal';
import { UserSession } from '@novu/testing';
import { of } from 'rxjs';

import { UpdateVercelConfiguration } from './update-vercel-configuration.usecase';
import { CompleteVercelIntegration } from '../complete-vercel-integration/complete-vercel-integration.usecase';
import { ApiException } from '../../../shared/exceptions/api.exception';

describe('UpdateVercelConfiguration', function () {
  let updateVercelConfiguration: UpdateVercelConfiguration;
  let session: UserSession;
  let httpServiceMock;
  let organizationRepositoryMock;
  let completeVercelIntegrationMock;

  beforeEach(async () => {
    // @ts-ignore
    process.env.VERCEL_BASE_URL = 'https://api.vercel.com';

    httpServiceMock = {
      get: stub().returns(
        of({
          data: {
            projects: [
              {
                id: 'project-1',
                env: [
                  { id: 'env-1', key: 'NEXT_PUBLIC_NOVU_CLIENT_APP_ID' },
                  { id: 'env-2', key: 'NOVU_CLIENT_APP_ID' },
                  { id: 'env-3', key: 'NOVU_SECRET_KEY' },
                ],
              },
            ],
          },
        })
      ),
      delete: stub().returns(of({ data: { success: true } })),
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
      findPartnerConfigurationDetails: stub().resolves([
        {
          partnerConfigurations: [{ projectIds: ['project-1'] }],
        },
      ]),
    };

    completeVercelIntegrationMock = {
      execute: stub().resolves({ success: true }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UpdateVercelConfiguration,
        { provide: HttpService, useValue: httpServiceMock },
        { provide: OrganizationRepository, useValue: organizationRepositoryMock },
        { provide: CompleteVercelIntegration, useValue: completeVercelIntegrationMock },
      ],
    }).compile();

    session = new UserSession();
    await session.initialize();
    updateVercelConfiguration = moduleRef.get<UpdateVercelConfiguration>(UpdateVercelConfiguration);
  });

  afterEach(() => {
    restore();
  });

  it('should update vercel configuration successfully', async function () {
    const command = {
      userId: session.user._id,
      organizationId: session.organization._id,
      environmentId: session.environment._id,
      configurationId: 'test-config-id',
      data: {
        'org-id': ['project-1'],
      },
    };

    const result = await updateVercelConfiguration.execute(command);

    expect(result.success).to.equal(true);

    // Verify configuration lookup
    assert.calledWith(organizationRepositoryMock.findOne, {
      _id: command.organizationId,
      'partnerConfigurations.configurationId': command.configurationId,
    });

    // Verify existing projects lookup
    assert.calledWith(organizationRepositoryMock.findPartnerConfigurationDetails, {
      userId: command.userId,
      configurationId: command.configurationId,
    });

    // Verify project environment variables lookup
    assert.calledWith(httpServiceMock.get, `${process.env.VERCEL_BASE_URL}/v4/projects?teamId=test-team-id`, {
      headers: {
        Authorization: 'Bearer test-token',
      },
    });

    // Verify environment variable deletion calls
    assert.calledWith(
      httpServiceMock.delete,
      `${process.env.VERCEL_BASE_URL}/v9/projects/project-1/env/env-1?teamId=test-team-id`,
      {
        headers: {
          Authorization: 'Bearer test-token',
        },
      }
    );
    assert.calledWith(
      httpServiceMock.delete,
      `${process.env.VERCEL_BASE_URL}/v9/projects/project-1/env/env-2?teamId=test-team-id`,
      {
        headers: {
          Authorization: 'Bearer test-token',
        },
      }
    );
    assert.calledWith(
      httpServiceMock.delete,
      `${process.env.VERCEL_BASE_URL}/v9/projects/project-1/env/env-3?teamId=test-team-id`,
      {
        headers: {
          Authorization: 'Bearer test-token',
        },
      }
    );

    // Verify complete integration call
    assert.calledWith(completeVercelIntegrationMock.execute, command);
  });

  it('should handle projects with no environment variables', async function () {
    httpServiceMock.get.returns(
      of({
        data: {
          projects: [
            {
              id: 'project-1',
              env: [],
            },
          ],
        },
      })
    );

    const command = {
      userId: session.user._id,
      organizationId: session.organization._id,
      environmentId: session.environment._id,
      configurationId: 'test-config-id',
      data: {
        'org-id': ['project-1'],
      },
    };

    const result = await updateVercelConfiguration.execute(command);

    expect(result.success).to.equal(true);
    assert.notCalled(httpServiceMock.delete);
    assert.calledWith(completeVercelIntegrationMock.execute, command);
  });

  it('should handle projects with missing Novu environment variables', async function () {
    httpServiceMock.get.returns(
      of({
        data: {
          projects: [
            {
              id: 'project-1',
              env: [{ id: 'env-1', key: 'OTHER_ENV_VAR' }],
            },
          ],
        },
      })
    );

    const command = {
      userId: session.user._id,
      organizationId: session.organization._id,
      environmentId: session.environment._id,
      configurationId: 'test-config-id',
      data: {
        'org-id': ['project-1'],
      },
    };

    const result = await updateVercelConfiguration.execute(command);

    expect(result.success).to.equal(true);
    assert.notCalled(httpServiceMock.delete);
    assert.calledWith(completeVercelIntegrationMock.execute, command);
  });

  it('should throw ApiException when configuration not found', async function () {
    organizationRepositoryMock.findOne.resolves(null);

    try {
      await updateVercelConfiguration.execute({
        userId: session.user._id,
        organizationId: session.organization._id,
        environmentId: session.environment._id,
        configurationId: 'test-config-id',
        data: {},
      });
      throw new Error('Should not reach here');
    } catch (error) {
      expect(error).to.be.instanceOf(ApiException);
      expect(error.message).to.equal('No configuration found for vercel');
      assert.notCalled(httpServiceMock.get);
      assert.notCalled(httpServiceMock.delete);
      assert.notCalled(completeVercelIntegrationMock.execute);
    }
  });

  it('should handle errors during project fetch', async function () {
    httpServiceMock.get.throws(new Error('HTTP Error'));

    try {
      await updateVercelConfiguration.execute({
        userId: session.user._id,
        organizationId: session.organization._id,
        environmentId: session.environment._id,
        configurationId: 'test-config-id',
        data: {
          'org-id': ['project-1'],
        },
      });
      throw new Error('Should not reach here');
    } catch (error) {
      expect(error).to.be.instanceOf(ApiException);
      expect(error.message).to.equal('HTTP Error');
      assert.notCalled(httpServiceMock.delete);
      assert.notCalled(completeVercelIntegrationMock.execute);
    }
  });

  it('should handle errors during environment variable deletion', async function () {
    httpServiceMock.delete.onCall(0).throws(new Error('Delete Error'));

    try {
      await updateVercelConfiguration.execute({
        userId: session.user._id,
        organizationId: session.organization._id,
        environmentId: session.environment._id,
        configurationId: 'test-config-id',
        data: {
          'org-id': ['project-1'],
        },
      });
      throw new Error('Should not reach here');
    } catch (error) {
      expect(error).to.be.instanceOf(ApiException);
      expect(error.message).to.equal('Delete Error');
      assert.called(httpServiceMock.get);
      assert.called(httpServiceMock.delete);
      assert.notCalled(completeVercelIntegrationMock.execute);
    }
  });

  it('should handle multiple projects with environment variables', async function () {
    httpServiceMock.get.returns(
      of({
        data: {
          projects: [
            {
              id: 'project-1',
              env: [{ id: 'env-1', key: 'NEXT_PUBLIC_NOVU_CLIENT_APP_ID' }],
            },
            {
              id: 'project-2',
              env: [{ id: 'env-2', key: 'NOVU_SECRET_KEY' }],
            },
          ],
        },
      })
    );

    organizationRepositoryMock.findPartnerConfigurationDetails.resolves([
      {
        partnerConfigurations: [{ projectIds: ['project-1', 'project-2'] }],
      },
    ]);

    const command = {
      userId: session.user._id,
      organizationId: session.organization._id,
      environmentId: session.environment._id,
      configurationId: 'test-config-id',
      data: {
        'org-id': ['project-1', 'project-2'],
      },
    };

    const result = await updateVercelConfiguration.execute(command);

    expect(result.success).to.equal(true);
    assert.calledTwice(httpServiceMock.delete);
    assert.calledWith(completeVercelIntegrationMock.execute, command);
  });
});
