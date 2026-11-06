import { h } from 'preact';
import { render } from '@testing-library/preact';

import { HomePage } from '../HomePage';

describe('HomePage', () => {
  it('shows the welcome', () => {
    const { getByTestId, getByText } = render(<HomePage />);
    expect(getByTestId('home-welcome')).toBeTruthy();
    expect(getByText('Home')).toBeTruthy();
  });
});
