import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { AddItemFlow } from '../AddItemFlow';
import type { CameraCaptureRecord } from '@/services/camera/CameraService';
import { useCaptureProcessing } from '@/hooks/useCaptureProcessing';

jest.mock('@/hooks/useCaptureProcessing', () => ({
  useCaptureProcessing: jest.fn(),
}));

const mockUseCaptureProcessing = useCaptureProcessing as jest.Mock;

function createCapture(overrides: Partial<CameraCaptureRecord> = {}): CameraCaptureRecord {
  return {
    id: 'capture-test',
    localUri: 'file://local.jpg',
    capturedAtUtc: '2025-01-01T00:00:00.000Z',
    updatedAtUtc: '2025-01-01T00:00:00.000Z',
    status: 'ready',
    retries: 0,
    version: 1,
    ...overrides,
  };
}

function flushMicrotasks() {
  return act(async () => {
    await Promise.resolve();
  });
}

describe('AddItemFlow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockUseCaptureProcessing.mockReturnValue({
      capture: null,
      captures: [],
      status: 'idle',
      isBusy: false,
      hasError: false,
      hasMask: false,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockUseCaptureProcessing.mockReset();
  });

  it('guides through steps and emits completion payload', () => {
    const onComplete = jest.fn();
    const nowUtc = jest.fn(() => '2025-01-15T12:00:00.000Z');

    const { getByText, getByTestId } = render(
      <AddItemFlow onComplete={onComplete} nowUtc={nowUtc} />
    );

    expect(getByTestId('step-title').props.children).toBe('Capture Item Photo');
    const nextButton = getByTestId('next-button');
    expect(nextButton).toBeDisabled();

    fireEvent.press(getByTestId('capture-confirm-button'));
    expect(nextButton).not.toBeDisabled();
    fireEvent.press(nextButton);

    expect(getByTestId('step-title').props.children).toBe('Clean Background');
    expect(nextButton).toBeDisabled();
    fireEvent.press(getByTestId('cleanup-confirm-button'));
    expect(nextButton).not.toBeDisabled();
    fireEvent.press(nextButton);

    expect(getByTestId('step-title').props.children).toBe('Add Item Details');
    expect(nextButton).toBeDisabled();
    fireEvent.changeText(getByTestId('details-name-input'), 'Linen Shirt');
    expect(nextButton).toBeDisabled();
    fireEvent.press(getByTestId('category-chip-tops'));
    expect(nextButton).toBeDisabled();
    fireEvent.press(getByTestId('season-chip-spring'));
    expect(nextButton).not.toBeDisabled();
    fireEvent.press(nextButton);

    expect(getByTestId('step-title').props.children).toBe('Review & Confirm');
    expect(nextButton).toBeDisabled();
    fireEvent.press(getByTestId('review-confirm-button'));
    expect(nextButton).not.toBeDisabled();
    fireEvent.press(nextButton);

    expect(onComplete).toHaveBeenCalledWith({
      name: 'Linen Shirt',
      category: 'tops',
      seasons: ['spring'],
      photoConfirmed: true,
      cleanupConfirmed: true,
      reviewAcknowledged: true,
      confirmedAtUtc: '2025-01-15T12:00:00.000Z',
    });
  });

  it('allows navigating back to adjust earlier steps', () => {
    const { getByTestId } = render(<AddItemFlow onComplete={jest.fn()} />);

    fireEvent.press(getByTestId('capture-confirm-button'));
    fireEvent.press(getByTestId('next-button'));

    expect(getByTestId('step-title').props.children).toBe('Clean Background');
    fireEvent.press(getByTestId('back-button'));
    expect(getByTestId('step-title').props.children).toBe('Capture Item Photo');
  });

  it('auto-unlocks cleanup step when capture is ready', async () => {
    mockUseCaptureProcessing.mockReturnValue({
      capture: createCapture({ status: 'ready', processedUri: 'file://processed.jpg' }),
      captures: [],
      status: 'ready',
      isBusy: false,
      hasError: false,
      hasMask: true,
    });

    const { getByTestId } = render(<AddItemFlow onComplete={jest.fn()} />);

    await flushMicrotasks();

    const nextButton = getByTestId('next-button');
    expect(nextButton).not.toBeDisabled();

    fireEvent.press(nextButton);
    expect(getByTestId('step-title').props.children).toBe('Clean Background');
    await flushMicrotasks();
    expect(nextButton).not.toBeDisabled();
  });

  it('shows capture error when cleanup fails', async () => {
    mockUseCaptureProcessing.mockReturnValue({
      capture: createCapture({ status: 'failed', lastError: 'proxy-timeout' }),
      captures: [],
      status: 'failed',
      isBusy: false,
      hasError: true,
      hasMask: false,
    });

    const { getByTestId } = render(<AddItemFlow onComplete={jest.fn()} />);

    await flushMicrotasks();

    expect(getByTestId('step-title').props.children).toBe('Capture Item Photo');
    const nextButton = getByTestId('next-button');
    expect(nextButton).toBeDisabled();
    expect(getByTestId('capture-error-message').props.children).toBe('proxy-timeout');
  });
});


