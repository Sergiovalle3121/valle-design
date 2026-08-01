import { DesignBlobStoreAdapter } from './design-blob-store.adapter';

describe('DesignBlobStoreAdapter (puerto CadBlobStore)', () => {
  it('delegates put/get 1:1 al DatabaseBlobStore subyacente', async () => {
    const put = jest.fn(async (data: Buffer, sha256: string) => ({
      blobKey: 'blob-1',
      sha256,
      size: data.length,
      created: true,
    }));
    const get = jest.fn(async () => Buffer.from('bytes'));
    const adapter = new DesignBlobStoreAdapter({ put, get });

    const sha = 'a'.repeat(64);
    await expect(adapter.put(Buffer.from('data'), sha)).resolves.toMatchObject({
      blobKey: 'blob-1',
      sha256: sha,
      size: 4,
    });
    expect(put).toHaveBeenCalledWith(expect.any(Buffer), sha);

    await expect(adapter.get('blob-1')).resolves.toEqual(Buffer.from('bytes'));
    expect(get).toHaveBeenCalledWith('blob-1');
  });

  it('propaga los fallos del almacenamiento subyacente sin tragarlos', async () => {
    const adapter = new DesignBlobStoreAdapter({
      put: jest.fn(async () => {
        throw new Error('sin espacio');
      }),
      get: jest.fn(async () => {
        throw new Error('missing blob');
      }),
    });
    await expect(adapter.put(Buffer.from('x'), 'f'.repeat(64))).rejects.toThrow(
      'sin espacio',
    );
    await expect(adapter.get('blob-x')).rejects.toThrow('missing blob');
  });
});
