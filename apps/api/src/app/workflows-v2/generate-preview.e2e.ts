import { UserSession } from '@novu/testing';
import { expect } from 'chai';
import { randomUUID } from 'node:crypto';
import { after, beforeEach } from 'mocha';
import { sleep } from '@nestjs/terminus/dist/utils';
import {
  ChannelTypeEnum,
  CronExpressionEnum,
  RedirectTargetEnum,
  StepTypeEnum,
  WorkflowCreationSourceEnum,
} from '@novu/shared';
import { EmailControlType } from '@novu/application-generic';
import { Novu } from '@novu/api';
import {
  CreateWorkflowDto,
  EmailRenderOutput,
  GeneratePreviewRequestDto,
  GeneratePreviewResponseDto,
} from '@novu/api/models/components';
import { buildCreateWorkflowDto } from './workflow.controller.e2e';
import { fullCodeSnippet, previewPayloadExample } from './maily-test-data';
import { initNovuClassSdkInternalAuth } from '../shared/helpers/e2e/sdk/e2e-sdk.helper';

const SUBJECT_TEST_PAYLOAD = '{{payload.subject.test.payload}}';
const PLACEHOLDER_SUBJECT_INAPP = '{{payload.subject}}';
const PLACEHOLDER_SUBJECT_INAPP_PAYLOAD_VALUE = 'this is the replacement text for the placeholder';

describe('Generate Preview #novu-v2', () => {
  let session: UserSession;
  let novuClient: Novu;

  beforeEach(async () => {
    session = new UserSession();
    await session.initialize();
    novuClient = initNovuClassSdkInternalAuth(session);
  });
  after(async () => {
    await sleep(1000);
  });

  async function patchStepWithControlValues(
    workflowSlug: string,
    stepSlug: string,
    controlValues: Record<string, unknown>
  ) {
    const res = await novuClient.workflows.steps.patch({
      patchStepDataDto: {
        controlValues,
      },
      workflowId: workflowSlug,
      stepId: stepSlug,
    });

    return res.result;
  }

  describe('Generate Preview', () => {
    describe('Hydration testing', () => {
      it.skip(` should hydrate previous step in iterator email --> digest`, async () => {
        const { workflowId, emailStepDatabaseId, digestStepId } = await createWorkflowWithEmailLookingAtDigestResult();
        const requestDto = {
          controlValues: getTestControlValues(digestStepId)[StepTypeEnum.EMAIL],
          previewPayload: { payload: { subject: PLACEHOLDER_SUBJECT_INAPP_PAYLOAD_VALUE } },
        };
        const previewResponseDto = await generatePreview(workflowId, emailStepDatabaseId, requestDto);
        expect(previewResponseDto.result!.preview).to.exist;
        expect(previewResponseDto.previewPayloadExample).to.exist;
        expect(previewResponseDto.previewPayloadExample?.steps?.[digestStepId]).to.be.ok;
        if (previewResponseDto.result!.type !== ChannelTypeEnum.EMAIL) {
          throw new Error('Expected email');
        }
        const preview = previewResponseDto.result.preview?.body;
        expect(preview).to.contain('{{item.payload.country}}');
      });

      it(` should hydrate previous step in iterator sms looking at inApp`, async () => {
        const { workflowId, smsDatabaseStepId, inAppStepId } = await createWorkflowWithSmsLookingAtInAppResult();
        const requestDto = buildDtoNoPayload(StepTypeEnum.SMS, inAppStepId);
        const previewResponseDto = await generatePreview(workflowId, smsDatabaseStepId, requestDto);
        expect(previewResponseDto.result.preview).to.exist;
        expect(previewResponseDto.previewPayloadExample).to.exist;
        expect(previewResponseDto.previewPayloadExample?.steps).to.be.ok;
        if (previewResponseDto.result?.type === 'sms' && previewResponseDto.result.preview?.body) {
          expect(previewResponseDto.result.preview.body).to.contain(`[[{{steps.${inAppStepId}.seen}}]]`);
        }
      });
    });

    it(`IN_APP :should match the body in the preview response`, async () => {
      const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(StepTypeEnum.IN_APP);
      const controlValues = buildInAppControlValues();
      const requestDto = {
        controlValues,
        previewPayload: { payload: { subject: PLACEHOLDER_SUBJECT_INAPP_PAYLOAD_VALUE } },
      };
      const previewResponseDto = await generatePreview(workflowId, stepDatabaseId, requestDto);
      expect(previewResponseDto.result!.preview).to.exist;
      controlValues.subject = controlValues.subject!.replace(
        PLACEHOLDER_SUBJECT_INAPP,
        PLACEHOLDER_SUBJECT_INAPP_PAYLOAD_VALUE
      );
      if (previewResponseDto.result?.type !== 'in_app') {
        throw new Error('should have a in-app preview ');
      }
      expect(previewResponseDto.result.preview?.subject).to.deep.equal(controlValues.subject);
    });

    describe('Happy Path, no payload, expected same response as requested', () => {
      // TODO: this test is not working as expected
      it('in_app: should match the body in the preview response', async () => {
        const previewResponseDto = await createWorkflowAndPreview(StepTypeEnum.IN_APP);

        expect(previewResponseDto.result).to.exist;
        if (!previewResponseDto.result) {
          throw new Error('missing preview');
        }
        if (previewResponseDto.result!.type !== 'in_app') {
          throw new Error('should be in app preview type');
        }
        const inApp = getTestControlValues().in_app;
        const previewRequestWithoutTheRedirect = { ...inApp, primaryAction: { label: inApp.primaryAction.label } };
        expect(previewResponseDto.result!.preview).to.deep.equal(previewRequestWithoutTheRedirect);
      });

      it('sms: should match the body in the preview response', async () => {
        const previewResponseDto = await createWorkflowAndPreview(StepTypeEnum.SMS);

        expect(previewResponseDto.result!.preview).to.exist;
        expect(previewResponseDto.previewPayloadExample).to.exist;
        expect(previewResponseDto.previewPayloadExample.subscriber, 'Expecting to find subscriber in the payload').to
          .exist;

        expect(previewResponseDto.result!.preview).to.deep.equal(getTestControlValues()[StepTypeEnum.SMS]);
      });

      it('push: should match the body in the preview response', async () => {
        const previewResponseDto = await createWorkflowAndPreview(StepTypeEnum.PUSH);

        expect(previewResponseDto.result!.preview).to.exist;
        expect(previewResponseDto.previewPayloadExample).to.exist;
        expect(previewResponseDto.previewPayloadExample.subscriber, 'Expecting to find subscriber in the payload').to
          .exist;

        expect(previewResponseDto.result!.preview).to.deep.equal(getTestControlValues()[StepTypeEnum.PUSH]);
      });

      it('chat: should match the body in the preview response', async () => {
        const previewResponseDto = await createWorkflowAndPreview(StepTypeEnum.CHAT);

        expect(previewResponseDto.result!.preview).to.exist;
        expect(previewResponseDto.previewPayloadExample).to.exist;
        expect(previewResponseDto.previewPayloadExample.subscriber, 'Expecting to find subscriber in the payload').to
          .exist;

        expect(previewResponseDto.result!.preview).to.deep.equal(getTestControlValues()[StepTypeEnum.CHAT]);
      });

      it('email: should match the body in the preview response', async () => {
        const previewResponseDto = await createWorkflowAndPreview(StepTypeEnum.EMAIL);
        const preview = previewResponseDto.result.preview as EmailRenderOutput;

        expect(previewResponseDto.result.type).to.equal(StepTypeEnum.EMAIL);

        expect(preview).to.exist;
        expect(preview.body).to.exist;
        expect(preview.subject).to.exist;
        expect(preview.body).to.contain(previewPayloadExample().payload.body);
        expect(preview.subject).to.contain(`Hello, World! ${SUBJECT_TEST_PAYLOAD}`);
        expect(previewResponseDto.previewPayloadExample).to.exist;
        expect(previewResponseDto.previewPayloadExample).to.deep.equal(previewPayloadExample());
      });

      async function createWorkflowAndPreview(type: StepTypeEnum) {
        const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(type);
        const requestDto = buildDtoNoPayload(type);

        return await generatePreview(workflowId, stepDatabaseId, requestDto);
      }
    });

    describe('payload sanitation', () => {
      it('Should produce a correct payload when pipe is used etc {{payload.variable | upper}}', async () => {
        const { stepDatabaseId, workflowId } = await createWorkflowAndReturnId(StepTypeEnum.SMS);
        const requestDto = {
          controlValues: {
            body: 'This is a legal placeholder with a pipe [{{payload.variableName | upcase}}the pipe should show in the preview]',
          },
        };
        const previewResponseDto = await generatePreview(workflowId, stepDatabaseId, requestDto);
        expect(previewResponseDto.result!.preview).to.exist;
        if (previewResponseDto.result!.type !== 'sms') {
          throw new Error('Expected sms');
        }
        expect(previewResponseDto.result.preview?.body).to.contain('{{PAYLOAD.VARIABLENAME}}');
        expect(previewResponseDto.previewPayloadExample).to.exist;
        expect(previewResponseDto?.previewPayloadExample?.payload?.variableName).to.equal('{{payload.variableName}}');
      });

      it('Should not fail if inApp is providing partial URL in redirect', async () => {
        const steps = [{ name: 'IN_APP_STEP_SHOULD_NOT_FAIL', type: StepTypeEnum.IN_APP }];
        const createDto = buildCreateWorkflowDto('', { steps });
        const novuRestResult = await novuClient.workflows.create(createDto);
        const controlValues = {
          subject: `{{subscriber.firstName}} Hello, World! ${PLACEHOLDER_SUBJECT_INAPP}`,
          body: `Hello, World! {{payload.placeholder.body}}`,
          avatar: 'https://www.example.com/avatar.png',
          primaryAction: {
            label: '{{payload.secondaryUrl}}',
            redirect: {
              target: RedirectTargetEnum.BLANK,
            },
          },
          secondaryAction: null,
          redirect: {
            target: RedirectTargetEnum.BLANK,
            url: '   ',
          },
        };
        const workflowSlug = novuRestResult.result.slug;
        const stepSlug = novuRestResult.result.steps[0].slug;
        await patchStepWithControlValues(workflowSlug, stepSlug, controlValues);
        const generatePreviewResponseDto = await generatePreview(workflowSlug, stepSlug, { controlValues });
        if (generatePreviewResponseDto.result?.type === ChannelTypeEnum.IN_APP) {
          expect(generatePreviewResponseDto.result.preview?.body).to.equal(
            {
              subject: `{{subscriber.firstName}} Hello, World! ${PLACEHOLDER_SUBJECT_INAPP}`,
              body: `Hello, World! {{payload.placeholder.body}}`,
              avatar: 'https://www.example.com/avatar.png',
              primaryAction: {
                label: '{{payload.secondaryUrl}}',
                redirect: {
                  target: RedirectTargetEnum.BLANK,
                },
              },
              secondaryAction: null,
              redirect: {
                target: RedirectTargetEnum.BLANK,
                url: '   ',
              },
            }.body
          );
        }
      });

      it('Should not fail if inApp url ref is a placeholder without payload', async () => {
        const steps = [{ name: 'IN_APP_STEP_SHOULD_NOT_FAIL', type: StepTypeEnum.IN_APP }];
        const createDto = buildCreateWorkflowDto('', { steps });
        const novuRestResult = await novuClient.workflows.create(createDto);
        const workflowSlug = novuRestResult.result?.slug;
        const stepSlug = novuRestResult.result?.steps[0].slug;
        await patchStepWithControlValues(workflowSlug, stepSlug, buildInAppControlValueWithAPlaceholderInTheUrl());
        const generatePreviewResponseDto = await generatePreview(workflowSlug, stepSlug, {
          controlValues: buildInAppControlValueWithAPlaceholderInTheUrl(),
        });

        if (generatePreviewResponseDto.result?.type === ChannelTypeEnum.IN_APP) {
          expect(generatePreviewResponseDto.result.preview?.body).to.equal(
            'Hello, World! {{payload.placeholder.body}}'
          );
        }
      });
    });

    describe('Missing Required ControlValues', () => {
      const channelTypes = [{ type: StepTypeEnum.IN_APP, description: 'InApp' }];

      channelTypes.forEach(({ type }) => {
        // TODO: We need to get back to the drawing board on this one to make the preview action of the framework more forgiving
        it(`[${type}] will generate gracefully the preview if the control values are missing`, async () => {
          const { stepDatabaseId, workflowId, stepId } = await createWorkflowAndReturnId(type);
          const requestDto = buildDtoWithMissingControlValues(type, stepId);

          const previewResponseDto = await generatePreview(workflowId, stepDatabaseId, requestDto);

          expect(previewResponseDto.result).to.not.eql({ preview: {} });
        });
      });
    });
  });

  async function createWorkflowWithEmailLookingAtDigestResult() {
    const createWorkflowDto: CreateWorkflowDto = {
      tags: [],
      source: WorkflowCreationSourceEnum.EDITOR,
      name: 'John',
      workflowId: `john:${randomUUID()}`,
      description: 'This is a test workflow',
      active: true,
      steps: [
        {
          name: 'DigestStep',
          type: StepTypeEnum.DIGEST,
        },
        {
          name: 'Email Test Step',
          type: StepTypeEnum.EMAIL,
        },
      ],
    };
    const workflowResult = await novuClient.workflows.create(createWorkflowDto);

    return {
      workflowId: workflowResult.result.id,
      emailStepDatabaseId: workflowResult.result.steps[1].id,
      digestStepId: workflowResult.result.steps[0].stepId,
    };
  }
  async function createWorkflowWithSmsLookingAtInAppResult() {
    const createWorkflowDto: CreateWorkflowDto = {
      tags: [],
      source: WorkflowCreationSourceEnum.EDITOR,
      name: 'John',
      workflowId: `john:${randomUUID()}`,
      description: 'This is a test workflow',
      active: true,
      steps: [
        {
          name: 'InAppStep',
          type: StepTypeEnum.IN_APP,
        },
        {
          name: 'SmsStep',
          type: StepTypeEnum.SMS,
        },
      ],
    };
    const workflowResult = await novuClient.workflows.create(createWorkflowDto);

    return {
      workflowId: workflowResult.result.id,
      smsDatabaseStepId: workflowResult.result.steps[1].id,
      inAppStepId: workflowResult.result.steps[0].stepId,
    };
  }
  async function generatePreview(
    workflowId: string,
    stepDatabaseId: string,
    dto: GeneratePreviewRequestDto
  ): Promise<GeneratePreviewResponseDto> {
    const novuRestResult = await novuClient.workflows.steps.generatePreview({
      generatePreviewRequestDto: dto,
      workflowId,
      stepId: stepDatabaseId,
    });

    return novuRestResult.result;
  }
  async function createWorkflowAndReturnId(type: StepTypeEnum) {
    const createWorkflowDto = buildCreateWorkflowDto(`${type}:${randomUUID()}`);
    createWorkflowDto.steps[0].type = type;
    const workflowResult = await novuClient.workflows.create(createWorkflowDto);

    return {
      workflowId: workflowResult.result.id,
      stepDatabaseId: workflowResult.result.steps[0].id,
      stepId: workflowResult.result.steps[0].stepId,
    };
  }
});

function buildDtoNoPayload(stepTypeEnum: StepTypeEnum, stepId?: string): GeneratePreviewRequestDto {
  return {
    controlValues: getTestControlValues(stepId)[stepTypeEnum],
  };
}

function buildEmailControlValuesPayload(): EmailControlType {
  return {
    subject: `Hello, World! ${SUBJECT_TEST_PAYLOAD}`,
    body: JSON.stringify(fullCodeSnippet()),
  };
}

function buildInAppControlValues() {
  return {
    subject: `{{subscriber.firstName}} Hello, World! ${PLACEHOLDER_SUBJECT_INAPP}`,
    body: `Hello, World! {{payload.placeholder.body}}`,
    avatar: 'https://www.example.com/avatar.png',
    primaryAction: {
      label: '{{payload.primaryUrlLabel}}',
      redirect: {
        target: RedirectTargetEnum.BLANK,
      },
    },
    secondaryAction: {
      label: 'Secondary Action',
      redirect: {
        target: RedirectTargetEnum.BLANK,
        url: '/home/secondary-action',
      },
    },
    data: {
      key: 'value',
    },
    redirect: {
      target: RedirectTargetEnum.BLANK,
      url: 'https://www.example.com/redirect',
    },
  };
}

function buildInAppControlValueWithAPlaceholderInTheUrl() {
  return {
    subject: `{{subscriber.firstName}} Hello, World! ${PLACEHOLDER_SUBJECT_INAPP}`,
    body: `Hello, World! {{payload.placeholder.body}}`,
    avatar: 'https://www.example.com/avatar.png',
    primaryAction: {
      label: '{{payload.secondaryUrlLabel}}',
      redirect: {
        url: '{{payload.secondaryUrl}}',
        target: RedirectTargetEnum.BLANK,
      },
    },
    secondaryAction: {
      label: 'Secondary Action',
      redirect: {
        target: RedirectTargetEnum.BLANK,
        url: '',
      },
    },
    redirect: {
      target: RedirectTargetEnum.BLANK,
      url: '   ',
    },
  };
}
function buildSmsControlValuesPayload(stepId: string | undefined) {
  return {
    body: `${stepId ? ` [[{{steps.${stepId}.seen}}]]` : ''} Hello, World! {{subscriber.firstName}}`,
  };
}

function buildPushControlValuesPayload() {
  return {
    subject: 'Hello, World!',
    body: 'Hello, World! {{subscriber.firstName}}',
  };
}

function buildChatControlValuesPayload() {
  return {
    body: 'Hello, World! {{subscriber.firstName}}',
  };
}
function buildDigestControlValuesPayload() {
  return {
    cron: CronExpressionEnum.EVERY_DAY_AT_8AM,
  };
}

export const getTestControlValues = (stepId?: string) => ({
  [StepTypeEnum.SMS]: buildSmsControlValuesPayload(stepId),
  [StepTypeEnum.EMAIL]: buildEmailControlValuesPayload(),
  [StepTypeEnum.PUSH]: buildPushControlValuesPayload(),
  [StepTypeEnum.CHAT]: buildChatControlValuesPayload(),
  [StepTypeEnum.IN_APP]: buildInAppControlValues(),
  [StepTypeEnum.DIGEST]: buildDigestControlValuesPayload(),
});

function buildDtoWithMissingControlValues(stepTypeEnum: StepTypeEnum, stepId: string): GeneratePreviewRequestDto {
  const stepTypeToElement = getTestControlValues(stepId)[stepTypeEnum];
  if (stepTypeEnum === StepTypeEnum.EMAIL) {
    delete stepTypeToElement.subject;
  } else {
    delete stepTypeToElement.body;
  }

  return {
    controlValues: stepTypeToElement,
    previewPayload: { payload: { subject: PLACEHOLDER_SUBJECT_INAPP_PAYLOAD_VALUE } },
  };
}
