import { useEffect, useMemo, useState, startTransition } from 'react';
import type { CameraCaptureRecord } from '@/services/camera/CameraService';
import { getCameraService } from '@/services/cameraCoordinator';

type CaptureMap = Map<string, CameraCaptureRecord>;

type UseCaptureProcessingOptions = {
  draftId?: string;
};

export type CaptureProcessingStatus = CameraCaptureRecord['status'] | 'idle';

export function useCaptureProcessing(options: UseCaptureProcessingOptions = {}) {
  const { draftId } = options;
  const [records, setRecords] = useState<CaptureMap>(new Map());

  useEffect(() => {
    const service = getCameraService();
    let mounted = true;

    service
      .listCachedCaptures()
      .then(list => {
        if (!mounted) {
          return;
        }
        if (list.length === 0) {
          return;
        }

        startTransition(() => {
          setRecords(
            list.reduce<CaptureMap>((map, record) => {
              map.set(record.id, record);
              return map;
            }, new Map())
          );
        });
      })
      .catch(error => {
        console.error('[useCaptureProcessing] Failed to list cached captures', error);
      });

    const unsubscribe = service.subscribe(event => {
      startTransition(() => {
        setRecords(prev => {
          const next = new Map(prev);
          next.set(event.record.id, event.record);
          return next;
        });
      });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const captureList = useMemo(() => Array.from(records.values()), [records]);

  const filteredCaptures = useMemo(() => {
    const scoped = draftId
      ? captureList.filter(capture => capture.draftId === draftId)
      : captureList;

    return scoped.sort(
      (a, b) => Date.parse(b.updatedAtUtc ?? b.capturedAtUtc) - Date.parse(a.updatedAtUtc ?? a.capturedAtUtc)
    );
  }, [captureList, draftId]);

  const capture = filteredCaptures[0] ?? null;
  const status: CaptureProcessingStatus = capture?.status ?? 'idle';

  return {
    capture,
    captures: filteredCaptures,
    status,
    isBusy: status === 'pending' || status === 'processing',
    hasError: status === 'failed',
    hasMask: Boolean(capture?.maskUri),
  };
}


