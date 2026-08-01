import { CideAiProviderAdapter } from './cide-ai-provider.adapter';
import { CadAiProviderError } from './ports/cad-ai-provider.port';

const ENV_KEYS = [
  'CIDE_BASE_URL',
  'CIDE_API_KEY',
  'CIDE_MODEL',
  'CIDE_VISION_MODEL',
  'CIDE_TIMEOUT_MS',
] as const;

describe('CideAiProviderAdapter (puerto CadAiProvider, WP2c)', () => {
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    global.fetch = originalFetch;
  });

  it('sin CIDE_BASE_URL: available=false y nunca contacta ningún motor', async () => {
    const adapter = new CideAiProviderAdapter();
    expect(adapter.available).toBe(false);
    await expect(
      adapter.chat({ messages: [{ role: 'user', content: 'hola' }] }),
    ).rejects.toBeInstanceOf(CadAiProviderError);
    await expect(
      adapter.vision({ messages: [{ role: 'user', content: 'plano' }] }),
    ).rejects.toBeInstanceOf(CadAiProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('con CIDE_BASE_URL: chat delega al endpoint OpenAI-compatible y mapea tool-calls', async () => {
    process.env.CIDE_BASE_URL = 'http://cide.test/v1/';
    process.env.CIDE_MODEL = 'modelo-prueba';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: ' listo ',
              tool_calls: [
                {
                  id: 'c1',
                  function: {
                    name: 'moveStation',
                    arguments: '{"station":"EST-10","x":1,"y":2}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });

    const adapter = new CideAiProviderAdapter();
    expect(adapter.available).toBe(true);
    const res = await adapter.chat({
      messages: [
        { role: 'system', content: 'sistema' },
        { role: 'user', content: 'mueve EST-10' },
      ],
      tools: [
        {
          name: 'moveStation',
          description: 'mueve',
          parameters: { type: 'object' },
        },
      ],
      maxTokens: 123,
      temperature: 0,
    });

    expect(res.content).toBe('listo');
    expect(res.toolCalls).toEqual([
      { name: 'moveStation', arguments: { station: 'EST-10', x: 1, y: 2 } },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://cide.test/v1/chat/completions');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('modelo-prueba');
    expect(body.max_tokens).toBe(123);
    expect(
      (body.tools as Array<{ function: { name: string } }>)[0].function.name,
    ).toBe('moveStation');
  });

  it('un fallo del motor cruza el puerto como CadAiProviderError con su status', async () => {
    process.env.CIDE_BASE_URL = 'http://cide.test/v1';
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'caído',
    });
    const adapter = new CideAiProviderAdapter();
    await expect(
      adapter.chat({ messages: [{ role: 'user', content: 'hola' }] }),
    ).rejects.toMatchObject({ name: 'CadAiProviderError', status: 503 });
  });

  it('con CIDE_BASE_URL: vision delega la llamada multimodal y devuelve el JSON crudo', async () => {
    process.env.CIDE_BASE_URL = 'http://cide.test/v1';
    process.env.CIDE_VISION_MODEL = 'vision-prueba';
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"walls":[]}' } }],
      }),
    });

    const adapter = new CideAiProviderAdapter();
    const res = await adapter.vision({
      messages: [
        { role: 'system', content: 'vectoriza' },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'plano' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AA==' },
            },
          ],
        },
      ],
    });

    expect(res.raw).toBe('{"walls":[]}');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://cide.test/v1/chat/completions');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe('vision-prueba');
    expect(body.max_tokens).toBe(1500);
    expect(body.temperature).toBe(0);
  });

  it('vision: un HTTP no-2xx se reporta como CadAiProviderError con el status', async () => {
    process.env.CIDE_BASE_URL = 'http://cide.test/v1';
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    const adapter = new CideAiProviderAdapter();
    await expect(
      adapter.vision({ messages: [{ role: 'user', content: 'plano' }] }),
    ).rejects.toMatchObject({ name: 'CadAiProviderError', status: 429 });
  });
});
