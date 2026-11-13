import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App shell', () => {
  it('offers the two ways in', () => {
    window.location.hash = '#/';
    render(<App />);
    expect(screen.getByRole('link', { name: 'Praticar um problema' })).toHaveAttribute(
      'href',
      '#/problems',
    );
    expect(screen.getByRole('link', { name: 'Canvas livre' })).toHaveAttribute('href', '#/free');
  });
});
