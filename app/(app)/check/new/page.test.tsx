import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}))

vi.mock('@/lib/jobs', () => ({
  startAnalyzeJob: vi.fn(),
}))

import NewAnalysisPage from './page'

describe('NewAnalysisPage', () => {
  it('renders the upload workflow without crashing', () => {
    render(<NewAnalysisPage />)

    expect(
      screen.getByRole('heading', { name: 'Start a New Analysis' })
    ).toBeInTheDocument()
    expect(screen.getByText('Upload Documents')).toBeInTheDocument()
    expect(screen.getByText('Analyze Documents')).toBeInTheDocument()
  })
})
