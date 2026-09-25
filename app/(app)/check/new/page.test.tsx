import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
const useDropzoneMock = vi.fn()
const startAnalyzeJobMock = vi.fn()
const saveSessionReportMock = vi.fn()
const parseUploadMock = vi.fn()
const fileDigestMock = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
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

vi.mock('@/lib/jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/jobs')>()),
  parseUpload: (...args: unknown[]) => parseUploadMock(...args),
  fileDigest: (...args: unknown[]) => fileDigestMock(...args),
  startAnalyzeJob: (...args: unknown[]) => startAnalyzeJobMock(...args),
}))

vi.mock('@/lib/session-reports', () => ({
  saveSessionReport: (...args: unknown[]) => saveSessionReportMock(...args),
}))

import NewAnalysisPage from './page'

function getDrop(): (accepted: File[], rejected?: { file: File }[]) => void {
  const options = useDropzoneMock.mock.calls.at(-1)?.[0] as { onDrop: (a: File[], r: { file: File }[]) => void } | undefined
  if (!options) throw new Error('Dropzone handler is unavailable.')
  return (accepted, rejected = []) => options.onDrop(accepted, rejected)
}

const pdf = (name: string, size = 2048) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })
const png = (name: string) => new File([new Uint8Array(16)], name, { type: 'image/png' })

/** Classifies by file name, like the backend would: "payslip*" → payslip, "week*" → avac, otherwise unknown. */
function classifyByName(file: File) {
  const n = file.name.toLowerCase()
  if (n.startsWith('payslip')) return { kind: 'payslip', name: file.name, data: { payslip: file.name } }
  if (n.startsWith('week')) return { kind: 'avac', name: file.name, data: { avac: file.name } }
  return { kind: 'unknown', name: file.name }
}

beforeEach(() => {
  vi.clearAllMocks()
  useDropzoneMock.mockImplementation(() => ({ getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false, open: vi.fn() }))
  fileDigestMock.mockImplementation(async (file: File) => `digest:${file.name}`)
  parseUploadMock.mockImplementation(async (file: File) => classifyByName(file))
  saveSessionReportMock.mockReturnValue('report-123')
  startAnalyzeJobMock.mockResolvedValue({ status: 'ok' })
})

async function drop(files: File[], rejected: File[] = []) {
  await act(async () => {
    getDrop()(files, rejected.map((file) => ({ file })))
  })
}

describe('NewAnalysisPage', () => {
  it('renders the hero, one dropzone, a folder chooser and the year-sized trust chip', () => {
    render(<NewAnalysisPage />)
    expect(screen.getByRole('heading', { name: 'Start Your Free Analysis' })).toBeInTheDocument()
    expect(useDropzoneMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Choose a folder' })).toBeInTheDocument()
    expect(screen.getByTestId('folder-input')).toHaveAttribute('webkitdirectory')
    expect(screen.getByText('PDF only · Up to 60 AVACs')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeDisabled()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent('Drop payslips and AVAC PDFs — or a whole folder — to begin.')
  })

  it('classifies each dropped file, shows kind badges and counts, and skips junk with a note', async () => {
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf'), pdf('Week 2.pdf'), pdf('Menu.pdf')], [png('Screenshot.png')])

    const list = screen.getByRole('list', { name: 'Files' })
    expect(within(list).getByText('Payslip')).toBeInTheDocument()
    expect(within(list).getAllByText('AVAC')).toHaveLength(2)
    expect(screen.getByTestId('file-counts')).toHaveTextContent('1/26 payslips · 2/60 AVACs · 2 skipped')
    const skipped = screen.getByText('Skipped 2 files').closest('details')!
    expect(within(skipped).getByText('Skipped — not a PDF')).toBeInTheDocument()
    expect(within(skipped).getByText('Skipped — not a payslip or AVAC')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent('Ready: 1 payslip and 2 AVACs. 2 skipped.')
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeEnabled()
  })

  it('skips non-PDFs locally without a parse request', async () => {
    render(<NewAnalysisPage />)
    await drop([], [png('a.png'), png('b.png'), new File(['x'], '.DS_Store')])
    expect(parseUploadMock).not.toHaveBeenCalled()
    expect(fileDigestMock).not.toHaveBeenCalled()
    expect(screen.getByText('Skipped 3 files')).toBeInTheDocument()
  })

  it('refuses a drop of more than 150 files without adding any of them', async () => {
    render(<NewAnalysisPage />)
    await drop(Array.from({ length: 151 }, (_, i) => pdf(`Week ${i}.pdf`)))
    expect(screen.getByRole('alert')).toHaveTextContent("That's 151 files. CheckPay reads up to 150 at a time — a year is about 80.")
    expect(parseUploadMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('list', { name: 'Files' })).not.toBeInTheDocument()
  })

  it('skips a byte-identical file and frees it when the original is removed', async () => {
    fileDigestMock.mockResolvedValue('same')
    render(<NewAnalysisPage />)
    await drop([pdf('Week 19.pdf'), pdf('Week 19 - copy.pdf')])
    expect(parseUploadMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Skipped — same file as Week 19.pdf')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Week 19.pdf' }))
    await drop([pdf('Week 19 - copy.pdf')])
    expect(parseUploadMock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('file-counts')).toHaveTextContent('0/26 payslips · 1/60 AVACs')
  })

  it('keeps reading the other files when one parse fails, and excludes that file from the run', async () => {
    parseUploadMock.mockImplementation(async (file: File) => {
      if (file.name === 'Week 2.pdf') throw { message: 'Too many requests. Please try again later.' }
      return classifyByName(file)
    })
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf'), pdf('Week 2.pdf')])

    expect(screen.getByText("Couldn't read")).toBeInTheDocument()
    expect(screen.getByText('Too many requests. Please try again later.')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent("Ready: 1 payslip and 1 AVAC. 1 couldn't be read and won't be included.")

    fireEvent.click(screen.getByRole('button', { name: 'Analyse Files' }))
    const [params] = startAnalyzeJobMock.mock.calls[0]
    expect(params).toEqual({
      payslips: [{ kind: 'payslip', name: 'Payslip 1.pdf', data: { payslip: 'Payslip 1.pdf' } }],
      avacs: [{ kind: 'avac', name: 'Week 1.pdf', data: { avac: 'Week 1.pdf' } }],
    })
  })

  it('shows "Reading…" while parses are in flight and keeps Analyse disabled', async () => {
    let finish: (v: unknown) => void = () => {}
    parseUploadMock.mockImplementation((file: File) => file.name === 'Week 1.pdf' ? new Promise((r) => { finish = r }) : classifyByName(file))
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf')])
    expect(screen.getByText('Reading…')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent('Reading 1 file…')
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeDisabled()
    await act(async () => { finish({ kind: 'avac', name: 'Week 1.pdf', data: {} }) })
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeEnabled()
  })

  it('disables Analyse when more than 26 payslips are ready', async () => {
    render(<NewAnalysisPage />)
    await drop([...Array.from({ length: 27 }, (_, i) => pdf(`Payslip ${i}.pdf`)), pdf('Week 1.pdf')])
    expect(screen.getByTestId('file-counts')).toHaveTextContent('27/26 payslips · 1/60 AVACs')
    expect(screen.getByTestId('analysis-status-message')).toHaveTextContent('Too many payslips (27 of 26). Remove some to continue.')
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Payslip 0.pdf' }))
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeEnabled()
  })

  it('replaces the form with the compare panel, then opens the report', async () => {
    vi.useFakeTimers()
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf'), pdf('Week 2.pdf')])
    fireEvent.click(screen.getByRole('button', { name: 'Analyse Files' }))

    const heading = screen.getByRole('heading', { name: 'Checking 2 AVACs against 1 payslip' })
    expect(heading).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Analyse Files' })).not.toBeInTheDocument()
    expect(screen.getByTestId('analysis-stage')).toHaveTextContent('Comparing every shift with the award rules and your payslips')

    await act(async () => { await Promise.resolve() })
    expect(saveSessionReportMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Your report is ready' })).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(pushMock).toHaveBeenCalledWith('/check/report/report-123')
    vi.useRealTimers()
  })

  it('returns to the form and focuses the error when the analysis fails', async () => {
    startAnalyzeJobMock.mockRejectedValue({ message: 'Parsed data exceeds the 3 MB request limit.' })
    render(<NewAnalysisPage />)
    await drop([pdf('Payslip 1.pdf'), pdf('Week 1.pdf')])
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Analyse Files' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Parsed data exceeds the 3 MB request limit.')
    expect(screen.getByRole('alert')).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Analyse Files' })).toBeInTheDocument()
    expect(screen.getByTestId('file-counts')).toHaveTextContent('1/26 payslips · 1/60 AVACs') // files survive a failed run
  })

  it('adds files chosen through the folder input', async () => {
    render(<NewAnalysisPage />)
    const input = screen.getByTestId('folder-input') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [pdf('Payslip 1.pdf'), png('shot.png')] } })
    })
    expect(screen.getByTestId('file-counts')).toHaveTextContent('1/26 payslips · 0/60 AVACs · 1 skipped')
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
})
