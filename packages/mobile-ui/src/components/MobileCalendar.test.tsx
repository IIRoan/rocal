jest.mock('@solace/ui/dist/components/calendar/mobile-event-calendar', () => ({
  MobileEventCalendar: (props) => <div {...props} />,
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MobileCalendar } from './MobileCalendar';

describe('MobileCalendar', () => {
  it('renders correctly', () => {
    const { getByTestId } = render(<MobileCalendar />);
    expect(getByTestId('mobile-calendar')).toBeTruthy();
  });

  it('calls onNext when swiping left', () => {
    const onNext = jest.fn();
    const { getByTestId } = render(<MobileCalendar onNext={onNext} />);
    fireEvent(getByTestId('mobile-calendar'), 'swipeLeft');
    expect(onNext).toHaveBeenCalled();
  });

  it('calls onPrevious when swiping right', () => {
    const onPrevious = jest.fn();
    const { getByTestId } = render(<MobileCalendar onPrevious={onPrevious} />);
    fireEvent(getByTestId('mobile-calendar'), 'swipeRight');
    expect(onPrevious).toHaveBeenCalled();
  });
});
