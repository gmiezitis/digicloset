import { API_BASE_URL } from '@/constants';
import * as FileSystem from 'expo-file-system';
import type { FileSystemUploadType } from 'expo-file-system/build/legacy/FileSystem.types';

export type UploadProgress = {
  uploadedBytes: number;
  totalBytes: number | null;
  progress: number | null;
};

export type UploadCaptureOptions = {
  captureId: string;
  localUri: string;
  draftId?: string;
  onProgress?: (payload: UploadProgress) => void;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  endpoint?: string;
};

export type UploadCaptureResult<T = unknown> = {
  status: number;
  body: T | null;
  headers: Record<string, string>;
};

const DEFAULT_ENDPOINT = '/background-removal/upload';

const MULTIPART_UPLOAD = 1 as FileSystemUploadType;

export async function uploadCaptureToProxy<T = unknown>(
  options: UploadCaptureOptions
): Promise<UploadCaptureResult<T>> {
  const baseUrl = options.endpoint
    ? options.endpoint
    : `${API_BASE_URL.replace(/\/$/, '')}${DEFAULT_ENDPOINT}`;

  const uploadTask = FileSystem.createUploadTask(
    baseUrl,
    options.localUri,
    {
      fieldName: 'file',
      httpMethod: 'POST',
      headers: {
        ...(options.headers ?? {}),
      },
      parameters: {
        captureId: options.captureId,
        ...(options.draftId ? { draftId: options.draftId } : {}),
      },
      uploadType: MULTIPART_UPLOAD,
    },
    data => {
      if (options.onProgress) {
        const uploadedBytes = data.totalBytesSent ?? 0;
        const totalBytes =
          data.totalBytesExpectedToSend && data.totalBytesExpectedToSend > 0
            ? data.totalBytesExpectedToSend
            : null;
        const progress =
          totalBytes && totalBytes > 0 ? uploadedBytes / totalBytes : totalBytes === 0 ? 1 : null;
        options.onProgress({
          uploadedBytes,
          totalBytes,
          progress,
        });
      }
    }
  );

  let aborted = false;
  const abortHandler = () => {
    aborted = true;
    void uploadTask.cancelAsync();
  };

  if (options.signal) {
    if (options.signal.aborted) {
      abortHandler();
    } else {
      options.signal.addEventListener('abort', abortHandler);
    }
  }

  try {
    const result = await uploadTask.uploadAsync();

    if (aborted) {
      throw new Error('Upload aborted');
    }

    if (result.status >= 400) {
      throw new Error(`Upload failed with status ${result.status}: ${result.body}`);
    }

    let parsedBody: T | null = null;
    if (result.body) {
      try {
        parsedBody = JSON.parse(result.body) as T;
      } catch (error) {
        throw new Error('Upload succeeded but response is not valid JSON');
      }
    }

    return {
      status: result.status,
      body: parsedBody,
      headers: result.headers ?? {},
    };
  } finally {
    if (options.signal) {
      options.signal.removeEventListener('abort', abortHandler);
    }
  }
}






