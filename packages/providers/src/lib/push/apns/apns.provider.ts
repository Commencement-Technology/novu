import { PushProviderIdEnum } from '@novu/shared';
import { ChannelTypeEnum, IPushOptions, IPushProvider, ISendMessageSuccessResponse } from '@novu/stateless';
import apn from '@parse/node-apn';
import { BaseProvider, CasingEnum } from '../../../base.provider';
import { WithPassthrough } from '../../../utils/types';

export class APNSPushProvider extends BaseProvider implements IPushProvider {
  id = PushProviderIdEnum.APNS;
  protected casing: CasingEnum = CasingEnum.CAMEL_CASE;
  channelType = ChannelTypeEnum.PUSH as ChannelTypeEnum.PUSH;

  protected override keyCaseObject: Record<string, string> = {
    contentAvailable: 'content-available',
    launchImage: 'launch-image',
    mutableContent: 'mutable-content',
    urlArgs: 'url-args',
    titleLocKey: 'title-loc-key',
    titleLocArgs: 'title-loc-args',
    actionLocKey: 'action-loc-key',
    locKey: 'loc-key',
    locArgs: 'loc-args',
  };

  private provider: apn.Provider;
  constructor(
    private config: {
      key: string;
      keyId: string;
      teamId: string;
      bundleId: string;
      production: boolean;
    }
  ) {
    super();
    this.config = config;
    this.provider = new apn.Provider({
      token: {
        key: this.validateAndFormatKey(config.key),
        keyId: config.keyId,
        teamId: config.teamId,
      },
      production: config.production,
    });
  }

  async sendMessage(
    options: IPushOptions,
    bridgeProviderData: WithPassthrough<Record<string, unknown>> = {}
  ): Promise<ISendMessageSuccessResponse> {
    // eslint-disable-next-line no-param-reassign
    delete (options.overrides as any)?.notificationIdentifiers;
    const notification = new apn.Notification(
      this.transform(bridgeProviderData, {
        body: options.content,
        title: options.title,
        payload: options.payload,
        topic: this.config.bundleId,
        ...options.overrides,
      }).body
    );
    const res = await this.provider.send(notification, options.target);

    if (res.failed.length > 0) {
      throw new Error(
        res.failed.map((failed) => `${failed.device} failed for reason: ${failed.response.reason}`).join(',')
      );
    }

    this.provider.shutdown();

    return {
      ids: res.sent?.map((response) => response.device),
      date: new Date().toISOString(),
    };
  }

  private validateAndFormatKey(key: string): string {
    // Check if key is already properly formatted
    const properFormat = /^-----BEGIN PRIVATE KEY-----\n[A-Za-z0-9+/=\n]+\n-----END PRIVATE KEY-----$/;

    if (properFormat.test(key)) {
      return key; // Key is already in correct format
    }

    // If not properly formatted, clean and format the key
    const cleanKey = key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|[\s\n\r]/g, '');

    const formattedKey = cleanKey.match(/.{1,64}/g)?.join('\n') || '';

    return `-----BEGIN PRIVATE KEY-----\n${formattedKey}\n-----END PRIVATE KEY-----`;
  }
}
