import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { resetWebMockLibrary } from '../desktop/webMock'

afterEach(() => {
  cleanup()
  resetWebMockLibrary()
  delete window.__TAURI_INTERNALS__
})
