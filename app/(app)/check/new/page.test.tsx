import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
const useDropzoneMock = vi.fn()
const startAnalyzeJobMock = vi.fn()
const saveSessionReportMock = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: unknown }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

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
    expect(screen.getByText('PDF only · Up to 10 AVACs')).toBeInTheDocument()
    expect(screen.getByText('Temporary session report')).toBeInTheDocument()
  })

  it('renders sample report preview CTA', () => {
    render(<NewAnalysisPage />)

    const previewLink = screen.getByRole('link', {
      name: 'Open sample report',
    })
    expect(previewLink).toBeInTheDocument()
    expect(previewLink).toHaveAttribute('href', '/check/sample-report')
    expect(screen.getByText('Preview a sample reconciliation report')).toBeInTheDocument()
    expect(
      screen.getByText('Uses fictional data so you can preview report structure and outcomes.')
    ).toBeInTheDocument()
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

  it('replaces the form with a live progress panel that ticks off each AVAC', async () => {
    let emit: (e: unknown) => void = () => {}
    startAnalyzeJobMock.mockImplementation(({ onProgress }) => {
      emit = onProgress
      return new Promise(() => {})
    })
    render(<NewAnalysisPage />)

    const { onPayslipDrop, onAvacDrop } = getCurrentDropHandlers()
    await act(async () => {
      onPayslipDrop([createPdfFile('payslip.pdf')])
      onAvacDrop([createPdfFile('week-1.pdf'), createPdfFile('week-2.pdf')])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Analyse Files' }))

    const heading = screen.getByRole('heading', { name: 'Checking 2 AVACs against your payslip' })
    expect(heading).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Analyse Files' })).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getAllByText('Checking')).toHaveLength(2)

    await act(async () => {
      emit({ avacName: 'week-2.pdf', index: 1, state: 'error', message: 'Unreadable', completed: 1, total: 2 })
    })

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('Skipped')).toBeInTheDocument()
    expect(screen.getByText('Unreadable')).toBeInTheDocument()
    expect(screen.getByText('It will be noted in your report.')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-stage')).toHaveTextContent('Comparing each AVAC with the award rules')
  })

  it('returns to the form and focuses the error when every AVAC fails', async () => {
    startAnalyzeJobMock.mockRejectedValue(new Error('Could not parse the payslip.'))
    render(<NewAnalysisPage />)

    const { onPayslipDrop, onAvacDrop } = getCurrentDropHandlers()
    await act(async () => {
      onPayslipDrop([createPdfFile('payslip.pdf')])
      onAvacDrop([createPdfFile('avac-1.pdf')])
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Analyse Files' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Could not parse the payslip.')
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeInTheDocument()
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

    expect(screen.getByRole('heading', { name: 'Your report is ready' })).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(pushMock).toHaveBeenCalledWith('/check/report/report-123')
    vi.useRealTimers()
  })
})
