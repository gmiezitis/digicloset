import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PlannerScreen } from '../PlannerScreen';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Feather: (props: any) => <Text {...props}>{props.name ?? 'icon'}</Text>,
  };
});

jest.mock('@/services/plannerStore', () => {
  const actual = jest.requireActual('@/services/plannerStore');
  return {
    ...actual,
    usePlannerState: jest.fn(),
    usePlannerCalendarMonth: jest.fn(),
    usePlannerEntriesForDate: jest.fn(),
    usePlannerSearch: jest.fn(),
    plannerStore: {
      initialize: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      reorder: jest.fn(),
      refresh: jest.fn(),
    },
    groupPlannerDays: jest.fn(),
  };
});

jest.mock('@/services/closetStore', () => ({
  useClosetState: jest.fn(),
  closetStore: {
    initialize: jest.fn(),
  },
}));

jest.mock('../PlannerScreen/CalendarGrid', () => {
  return function MockCalendarGrid() {
    return <></>;
  };
});

jest.mock('../PlannerScreen/DayDetailSheet', () => {
  return function MockDaySheet() {
    return null;
  };
});

jest.mock('../PlannerScreen/EntryComposer', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return function MockComposer(props: any) {
    if (!props.visible) {
      return null;
    }
    return (
      <View testID="mock-composer">
        <TouchableOpacity
          onPress={() =>
            props.onSubmit({
              wardrobeItemIds: ['item-1'],
              note: 'Test look',
              context: 'work',
              lookKind: 'single',
            })
          }
        >
          <Text>Mock Save Entry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={props.onCancel}>
          <Text>Close</Text>
        </TouchableOpacity>
      </View>
    );
  };
});

const plannerStoreModule = jest.requireMock('@/services/plannerStore');
const closetStoreModule = jest.requireMock('@/services/closetStore');

describe('PlannerScreen', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-04-11T00:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    plannerStoreModule.usePlannerState.mockReturnValue({
      loading: false,
      entries: [],
    });
    plannerStoreModule.usePlannerCalendarMonth.mockReturnValue([]);
    plannerStoreModule.usePlannerEntriesForDate.mockReturnValue([]);
    plannerStoreModule.usePlannerSearch.mockReturnValue([]);
    plannerStoreModule.groupPlannerDays.mockReturnValue([]);
    plannerStoreModule.plannerStore.initialize.mockResolvedValue(undefined);
    plannerStoreModule.plannerStore.save.mockResolvedValue(undefined);
    plannerStoreModule.plannerStore.remove.mockResolvedValue(undefined);
    plannerStoreModule.plannerStore.reorder.mockResolvedValue(undefined);
    closetStoreModule.useClosetState.mockReturnValue({
      items: [],
      loading: false,
    });
    closetStoreModule.closetStore.initialize.mockResolvedValue(undefined);
  });

  it('renders month header and helper messaging', () => {
    const { getByText } = render(<PlannerScreen />);

    expect(getByText('April 2025')).toBeTruthy();
    expect(
      getByText(/Add multiple looks per day, keep notes for events/i)
    ).toBeTruthy();
    expect(getByText('Usage highlights')).toBeTruthy();
  });
  it('opens composer and saves through planner store', async () => {
    const { getByText, queryByTestId } = render(<PlannerScreen />);

    fireEvent.press(getByText('Add look'));
    expect(queryByTestId('mock-composer')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText('Mock Save Entry'));
      await Promise.resolve();
    });
    expect(plannerStoreModule.plannerStore.save).toHaveBeenCalled();
  });
});


