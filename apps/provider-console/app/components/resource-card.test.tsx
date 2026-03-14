import React from 'react';
import { render, screen } from '@testing-library/react';
import { ResourceCard } from './resource-card';

describe('ResourceCard', () => {
  it('clamps values above 100 for width, text, and aria-valuenow', () => {
    render(<ResourceCard title="CPU Usage" usagePercent={145.8} detail="detail" />);

    const valueText = screen.getByText('100%');
    expect(valueText).toBeInTheDocument();

    const progress = screen.getByRole('progressbar', { name: 'CPU Usage' });
    expect(progress).toHaveStyle({ width: '100%' });
    expect(progress).toHaveAttribute('aria-valuenow', '100');
  });

  it('falls back to 0 when usagePercent is not finite', () => {
    render(<ResourceCard title="Memory Usage" usagePercent={Number.NaN} detail="detail" />);

    const valueText = screen.getByText('0%');
    expect(valueText).toBeInTheDocument();

    const progress = screen.getByRole('progressbar', { name: 'Memory Usage' });
    expect(progress).toHaveStyle({ width: '0%' });
    expect(progress).toHaveAttribute('aria-valuenow', '0');
  });
});
