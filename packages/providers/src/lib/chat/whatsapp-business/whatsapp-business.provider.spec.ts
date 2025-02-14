import { expect, test } from 'vitest';
import { IChatOptions } from '@novu/stateless';
import { WhatsappBusinessChatProvider } from './whatsapp-business.provider';
import { axiosSpy } from '../../../utils/test/spy-axios';

const mockProviderConfig = {
  accessToken: 'my-access-token',
  phoneNumberIdentification: '1234567890',
};

const buildResponse = () => ({
  data: {
    messaging_product: 'whatsapp',
    contacts: [{ input: 'Any input', wa_id: 'contact-id' }],
    messages: [{ id: 'message-id' }],
  },
});

const baseUrl = (phoneNumberIdentification: string) =>
  `https://graph.facebook.com/v18.0/${phoneNumberIdentification}/messages`;

const expectedHeaders = (accessToken: string) => ({
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
});

test('should trigger whatsapp-business library correctly with simple text message', async () => {
  const { mockPost, axiosMockSpy } = axiosSpy(buildResponse());

  const provider = new WhatsappBusinessChatProvider(mockProviderConfig);

  const options: IChatOptions = {
    phoneNumber: '+111111111',
    content: 'Simple text message',
  };

  const res = await provider.sendMessage(options);

  expect(mockPost).toHaveBeenCalled();
  expect(mockPost).toHaveBeenCalledWith(baseUrl(mockProviderConfig.phoneNumberIdentification), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    text: {
      body: options.content,
      preview_url: false,
    },
    to: options.phoneNumber,
    type: 'text',
  });

  expect(axiosMockSpy).toHaveBeenCalledWith(expectedHeaders(mockProviderConfig.accessToken));

  expect(res.id).toBe('message-id');
});

test('should trigger whatsapp-business library correctly with template message', async () => {
  const { mockPost, axiosMockSpy } = axiosSpy(buildResponse());

  const provider = new WhatsappBusinessChatProvider(mockProviderConfig);

  const options: IChatOptions = {
    phoneNumber: '+111111111',
    content: 'Simple text message',
    customData: {
      template: {
        name: 'hello_world',
        language: {
          code: 'en_US',
        },
      },
    },
  };

  const res = await provider.sendMessage(options);

  expect(mockPost).toHaveBeenCalled();
  expect(mockPost).toHaveBeenCalledWith(baseUrl(mockProviderConfig.phoneNumberIdentification), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    template: options.customData.template,
    to: options.phoneNumber,
    type: 'template',
  });

  expect(axiosMockSpy).toHaveBeenCalledWith(expectedHeaders(mockProviderConfig.accessToken));

  expect(res.id).toBe('message-id');
});

test('should trigger whatsapp-business library correctly with simple text message with _passthrough', async () => {
  const { mockPost, axiosMockSpy } = axiosSpy(buildResponse());

  const provider = new WhatsappBusinessChatProvider(mockProviderConfig);

  const options: IChatOptions = {
    phoneNumber: '+111111111',
    content: 'Simple text message',
  };

  const res = await provider.sendMessage(options, {
    _passthrough: {
      body: {
        text: {
          body: `${options.content} _passthrough`,
        },
      },
    },
  });

  expect(mockPost).toHaveBeenCalled();
  expect(mockPost).toHaveBeenCalledWith(baseUrl(mockProviderConfig.phoneNumberIdentification), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    text: {
      body: `${options.content} _passthrough`,
      preview_url: false,
    },
    to: options.phoneNumber,
    type: 'text',
  });

  expect(axiosMockSpy).toHaveBeenCalledWith(expectedHeaders(mockProviderConfig.accessToken));

  expect(res.id).toBe('message-id');
});

test('should trigger whatsapp-business library correctly with template message with _passthrough', async () => {
  const { mockPost, axiosMockSpy } = axiosSpy(buildResponse());

  const provider = new WhatsappBusinessChatProvider(mockProviderConfig);

  const options: IChatOptions = {
    phoneNumber: '+111111111',
    content: 'Simple text message',
    customData: {
      template: {
        name: 'hello_world',
        language: {
          code: 'en_US',
        },
      },
    },
  };

  const res = await provider.sendMessage(options, {
    _passthrough: {
      body: {
        template: {
          name: 'hello_world_passthrough',
          language: {
            code: 'en_US',
          },
        },
      },
    },
  });

  expect(mockPost).toHaveBeenCalled();
  expect(mockPost).toHaveBeenCalledWith(baseUrl(mockProviderConfig.phoneNumberIdentification), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    template: {
      name: 'hello_world_passthrough',
      language: {
        code: 'en_US',
      },
    },
    to: options.phoneNumber,
    type: 'template',
  });

  expect(axiosMockSpy).toHaveBeenCalledWith(expectedHeaders(mockProviderConfig.accessToken));

  expect(res.id).toBe('message-id');
});
