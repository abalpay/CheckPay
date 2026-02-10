import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
const useDropzoneMock = vi.fn()
const startAnalyzeJobMock = vi.fn()
const saveSessionReportMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    prefetch: vi.fn(),
  }),
}))

vi.mock('react-dropzone', () => ({
  useDropzone: (options: unknown) => useDropzoneMock(options),
}))

vi.mock('@/lib/jobs', () => ({
  startAnalyzeJob: (...args: unknown[]) => startAnalyzeJobMock(...args),
}))

vi.mock('@/lib/session-reports', () => ({
  saveSessionReport: (...args: unknown[]) => saveSessionReportMock(...args),
}))

import NewAnalysisPage from './page'

interface DropzoneOptions {
  onDrop: (acceptedFiles: File[]) => void
}

function getCurrentDropHandlers(): {
  onPayslipDrop: (acceptedFiles: File[]) => void
  onAvacDrop: (acceptedFiles: File[]) => void
} {
  const calls = useDropzoneMock.mock.calls
  const payslip = calls.at(-2)?.[0] as DropzoneOptions | undefined
  const avac = calls.at(-1)?.[0] as DropzoneOptions | undefined

  if (!payslip || !avac) {
    throw new Error('Dropzone handlers are unavailable.')
  }

  return {
    onPayslipDrop: payslip.onDrop,
    onAvacDrop: avac.onDrop,
  }
}

function createPdfFile(name: string, sizeBytes = 2048): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'application/pdf' })
}

describe('NewAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    useDropzoneMock.mockImplementation(() => ({
      getRootProps: () => ({}),
      getInputProps: () => ({}),
      isDragActive: false,
    }))

    saveSessionReportMock.mockReturnValue('report-123')
    startAnalyzeJobMock.mockResolvedValue({ status: 'ok' })
  })

  it('renders the refreshed hero and primary action', () => {
    render(<NewAnalysisPage />)

    expect(screen.getByRole('heading', { name: 'Start Your Free Analysis' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeInTheDocument()
  })

  it('renders trust and limit chips', () => {
    render(<NewAnalysisPage />)

    expect(screen.getByText('No account required')).toBeInTheDocument()
    expect(screen.getByText('PDF only · Max 5 MB each')).toBeInTheDocument()
    expect(screen.getByText('Temporary session report')).toBeInTheDocument()
  })

  it('keeps analyse button disabled before required uploads', () => {
    render(<NewAnalysisPage />)

    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeDisabled()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent(
      'Upload 1 payslip and at least 1 AVAC to continue.',
    )
  })

  it('shows AVAC count label when AVAC files are selected', async () => {
    render(<NewAnalysisPage />)

    const { onAvacDrop } = getCurrentDropHandlers()

    await act(async () => {
      onAvacDrop([createPdfFile('avac-one.pdf')])
    })

    expect(screen.getByText('1/10 selected')).toBeInTheDocument()
    expect(screen.getByText('Selected AVAC files (1/10)')).toBeInTheDocument()
  })

  it('shows analyzing label and status while analysis is running', async () => {
    startAnalyzeJobMock.mockImplementation(() => new Promise(() => {}))
    render(<NewAnalysisPage />)

    const { onPayslipDrop, onAvacDrop } = getCurrentDropHandlers()

    await act(async () => {
      onPayslipDrop([createPdfFile('payslip.pdf')])
      onAvacDrop([createPdfFile('avac-1.pdf')])
    })

    const button = screen.getByRole('button', { name: 'Analyse Files' })
    fireEvent.click(button)

    expect(screen.getByRole('button', { name: 'Analysing Files...' })).toBeDisabled()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent(
      'Please keep this tab open while analysis runs.',
    )
  })

  it('redirects to report page after successful analysis', async () => {
    vi.useFakeTimers()
    render(<NewAnalysisPage />)

    const { onPayslipDrop, onAvacDrop } = getCurrentDropHandlers()

    await act(async () => {
      onPayslipDrop([createPdfFile('payslip.pdf')])
      onAvacDrop([createPdfFile('avac-1.pdf')])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Analyse Files' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(startAnalyzeJobMock).toHaveBeenCalledTimes(1)
    expect(saveSessionReportMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1200)
    })

    expect(pushMock).toHaveBeenCalledWith('/check/report/report-123')
    vi.useRealTimers()
  })
})
