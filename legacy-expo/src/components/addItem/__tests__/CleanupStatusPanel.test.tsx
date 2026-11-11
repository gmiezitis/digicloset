import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CleanupStatusPanel } from '../CleanupStatusPanel';
import type { CameraCaptureRecord } from '@/services/camera/CameraService';

function createCapture(overrides: Partial<CameraCaptureRecord> = {}): CameraCaptureRecord {
  return {
    id: 'capture-test',
    draftId: 'draft-1',
    localUri: 'file://local.jpg',
    capturedAtUtc: '2025-01-01T00:00:00.000Z',
    updatedAtUtc: '2025-01-01T00:00:00.000Z',
    status: 'pending',
    retries: 0,
    version: 1,
    ...overrides,
  };
}

describe('CleanupStatusPanel', () => {
  it('renders awaiting message when capture is missing', () => {
    const { getByTestId } = render(<CleanupStatusPanel capture={null} />);

    expect(getByTestId('cleanup-status-message').props.children).toContain('Capture a garment photo');
    expect(getByTestId('cleanup-queue-message').props.children).toContain('Capture');
  });

  it('enables manual tools when mask is ready', () => {
    const capture = createCapture({
      status: 'ready',
      maskUri: 'file://mask.png',
    });

    const handleBrush = jest.fn();
    const handleErase = jest.fn();

    const { getByTestId } = render(
      <CleanupStatusPanel capture={capture} onBrush={handleBrush} onErase={handleErase} />
    );

    const brushButton = getByTestId('cleanup-brush-button');
    const eraseButton = getByTestId('cleanup-erase-button');

    fireEvent.press(brushButton);
    fireEvent.press(eraseButton);

    expect(handleBrush).toHaveBeenCalledWith(capture);
    expect(handleErase).toHaveBeenCalledWith(capture);
  });

  it('shows retry when cleanup fails', () => {
    const capture = createCapture({
      status: 'failed',
      lastError: 'proxy-timeout',
    });
    const handleRetry = jest.fn();

    const { getByTestId } = render(
      <CleanupStatusPanel capture={capture} onRetry={handleRetry} />
    );

    const retryButton = getByTestId('cleanup-retry-button');
    fireEvent.press(retryButton);

    expect(handleRetry).toHaveBeenCalledWith(capture);
  });

  it('shows preview image when capture is ready', () => {
    const capture = createCapture({
      status: 'ready',
      processedUri: 'file://processed.png',
    });

    const { getByTestId } = render(<CleanupStatusPanel capture={capture} />);

    expect(getByTestId('cleanup-preview-image')).toBeTruthy();
  });

  it('shows queue telemetry when retries are scheduled', () => {
    const capture = createCapture();
    const queue = {
      captureId: capture.id,
      attempt: 1,
      state: 'scheduled' as const,
      nextRunUtc: '2025-01-02T12:00:00.000Z',
      reason: 'retry',
    };

    const { getByTestId } = render(<CleanupStatusPanel capture={capture} queue={queue} />);

    expect(getByTestId('cleanup-queue-message').props.children).toContain('Next retry');
  });
});


