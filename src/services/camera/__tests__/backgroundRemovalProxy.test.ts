import { createProxyBackgroundRemovalAdapter } from '../BackgroundRemovalQueue';

describe('createProxyBackgroundRemovalAdapter', () => {
  it('sends validated payload and parses response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        processedUri: 'https://cdn.example.com/processed/capture-1.png',
        maskUri: 'https://cdn.example.com/masks/capture-1.png',
        metadata: { engine: 'removebg' },
      }),
    });

    const adapter = createProxyBackgroundRemovalAdapter({
      baseUrl: 'https://proxy.example.com',
      fetchImpl: fetchMock,
    });

    const result = await adapter.removeBackground({
      captureId: 'capture-1',
      localUri: 'https://local.example.com/uploads/capture-1.jpg',
      draftId: 'draft-1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.example.com/background-removal',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      captureId: 'capture-1',
      draftId: 'draft-1',
      sourceUri: 'https://local.example.com/uploads/capture-1.jpg',
    });
    expect(result).toEqual({
      processedUri: 'https://cdn.example.com/processed/capture-1.png',
      maskUri: 'https://cdn.example.com/masks/capture-1.png',
      metadata: { engine: 'removebg' },
    });
  });

  it('throws when proxy response is invalid', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        maskUri: 'https://cdn.example.com/masks/capture-1.png',
      }),
    });

    const adapter = createProxyBackgroundRemovalAdapter({
      baseUrl: 'https://proxy.example.com',
      fetchImpl: fetchMock,
    });

    await expect(
      adapter.removeBackground({
        captureId: 'capture-1',
        localUri: 'https://local.example.com/uploads/capture-1.jpg',
      })
    ).rejects.toThrow(/processedUri/);
  });
});









