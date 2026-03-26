import React from 'react';
import { render } from '@testing-library/react-native';
import MobileSidebar from './MobileSidebar';

describe('MobileSidebar', () => {
  it('renders correctly', () => {
    const { getByText } = render(<MobileSidebar />);
    expect(getByText('Mobile Sidebar')).toBeTruthy();
  });
});
