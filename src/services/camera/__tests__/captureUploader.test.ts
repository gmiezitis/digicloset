import { uploadCaptureToProxy } from '../captureUploader';

jest.mock('expo-file-system', () => ({
  __esModule: true,
  createUploadTask: jest.fn(),
  FileSystemUploadType: {
    MULTIPART: 'multipart',
  },
}));

const FileSystem = jest.requireMock('expo-file-system');

describe('uploadCaptureToProxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads capture using multipart form and reports progress', async () => {
    const progressEvents: number[] = [];
    const uploadAsyncMock = jest.fn().mockImplementation(async () => {
      return {
        status: 202,
        body: JSON.stringify({ uploadId: 'upload-123' }),
        headers: { 'content-type': 'application/json' },
      };
    });

    (FileSystem.createUploadTask as jest.Mock).mockImplementation(
      (_url: string, _fileUri: string, _options: unknown, progressCallback: (payload: any) => void) => {
        return {
          uploadAsync: jest.fn(async () => {
            progressCallback({
              totalBytesSent: 512,
              totalBytesExpectedToSend: 1024,
            });
            return uploadAsyncMock();
          }),
          cancelAsync: jest.fn(),
        };
      }
    );

    const result = await uploadCaptureToProxy({
      captureId: 'capture-1',
      localUri: 'file://capture.jpg',
      draftId: 'draft-1',
      onProgress: progress => {
        progressEvents.push(progress.progress ?? 0);
      },
    });

    expect(FileSystem.createUploadTask).toHaveBeenCalledWith(
      'https://api.digicloset.local/background-removal/upload',
      'file://capture.jpg',
      expect.objectContaining({
        uploadType: 1,
        fieldName: 'file',
        parameters: { captureId: 'capture-1', draftId: 'draft-1' },
      }),
      expect.any(Function)
    );
    expect(progressEvents).toEqual([0.5]);
    expect(result).toEqual({
      status: 202,
      body: { uploadId: 'upload-123' },
      headers: { 'content-type': 'application/json' },
    });
  });

  it('cancels upload when signal aborts', async () => {
    const cancelAsync = jest.fn().mockResolvedValue(undefined);
    const uploadAsync = jest.fn().mockResolvedValue({
      status: 200,
      body: null,
      headers: {},
    });

    (FileSystem.createUploadTask as jest.Mock).mockImplementation(
      (_url: string, _fileUri: string, _options: unknown) => ({
        uploadAsync,
        cancelAsync,
      })
    );

    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadCaptureToProxy({
        captureId: 'capture-2',
        localUri: 'file://capture-2.jpg',
        signal: controller.signal,
      })
    ).rejects.toThrow('Upload aborted');

    expect(cancelAsync).toHaveBeenCalled();
  });
});


