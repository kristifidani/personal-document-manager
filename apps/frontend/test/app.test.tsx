// Smoke test: the app renders without crashing.

import { render, screen } from '@testing-library/react'
import { test } from 'vitest'
import { App } from '../src/App'

test('renders the app title', () => {
  render(<App />)
  screen.getByRole('heading', { name: 'Personal Document Manager' })
})
