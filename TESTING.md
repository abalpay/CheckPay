# FairPay Backendless MVP Testing Checklist

## Manual Test Steps for n8n-Backed Upload Flow

### Happy Path Test

1. **Navigate to upload page**
   - Go to `/check/new`
   - Verify the page loads with two dropzones and overtime configuration
   - Confirm MVP notice is displayed

2. **Upload files**
   - Drop or select one payslip PDF (test with a dummy PDF file)
   - Drop or select 2-3 AVAC form PDFs (test with dummy PDF files)
   - Verify files appear in the UI with correct names and file sizes
   - Confirm file validation works (PDF only, size limits)

3. **Configure overtime**
   - Set rostered overtime = 0 (default)
   - Test different values like 0.4, 1.0, etc.
   - Verify the field accepts decimal values and enforces minimum of 0

4. **Execute analysis (n8n integration)**
   - Click "Analyze Documents →" button
   - Verify button shows loading state with spinner
   - Wait for webhook response from n8n (typically 5–20s)
   - Confirm success message appears briefly
   - Verify automatic redirect to report page `/check/report/{id}`

5. **Report page verification**
   - Redirects to `/check/report/{id}`
   - Report page renders analysis summary and details from local storage
   - Verify export JSON works and navigation actions function

### Error Scenarios to Test

#### File Validation Errors
- **Non-PDF files**: Upload .txt, .jpg, or .docx → should show "not a PDF file" error
- **Large files**: Upload PDF > 5MB → should show "too large" error  
- **Too many AVACs**: Try to upload 11 AVAC files → should show "Maximum 10 AVAC files" error
- **Missing payslip**: Try to analyze with only AVAC files → button should be disabled
- **Missing AVACs**: Try to analyze with only payslip → button should be disabled

#### UI Interaction Tests
- **File removal**: Upload multiple AVAC files, then remove individual files using "Remove" button
- **Form reset**: Upload files and use "Reset" button to clear all files and reset form
- **Drag and drop**: Test drag and drop functionality for both dropzones
- **Responsive design**: Test on mobile and desktop viewports

### Expected Behavior

#### File Upload
- Only PDF files accepted
- File size validation (5MB max per file)
- Maximum 1 payslip + 10 AVAC files
- Files display with name and size
- Individual file removal for AVAC files

#### Form Validation
- "Analyze Documents" button disabled until requirements met:
  - At least 1 payslip file
  - At least 1 AVAC file
- Real-time calculation of expected base units
- Form inputs properly validated (numeric ranges)

#### Loading States
- Button shows spinner during 2-second simulation
- Form inputs disabled during analysis
- Success message shown before redirect

#### Navigation
- Successful analysis redirects to `/check/processing/{id}`
- Processing page shows mock results
- Navigation buttons work correctly
- Back button returns to upload form

### Performance Expectations
- File validation happens instantly (client-side)
- One network request to n8n webhook for analysis
- Typical processing time 5–20s
- Smooth transitions between states
- Responsive UI throughout interaction

### Accessibility Checklist
- Dropzones keyboard accessible
- Form inputs have proper labels
- Error messages announced by screen readers
- Loading states communicated to assistive technologies
- Focus management works correctly
- Color contrast meets WCAG standards

### MVP Notes
- Results are stored in `localStorage` under the generated job ID for viewing on the report page
- No authentication

This backendless MVP demonstrates the complete user flow and interface without requiring any backend infrastructure.