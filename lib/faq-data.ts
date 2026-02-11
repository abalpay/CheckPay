export type Faq = {
  question: string
  answer: string
}

export const faqs: Faq[] = [
  {
    question: 'Is CheckPay really free?',
    answer:
      'Yes, 100% free. There are no hidden fees, no premium tiers, and no account required. Upload your documents and get your report at no cost.',
  },
  {
    question: 'Is my data stored after analysis?',
    answer:
      'No. Uploaded files are processed in temporary memory and automatically deleted once your report is generated. We do not retain payslip or AVAC data.',
  },
  {
    question: 'What documents do I need?',
    answer:
      'You need one payslip PDF from Queensland Health and your corresponding AVAC form PDFs for the same pay period. You can upload up to 10 AVAC files at once.',
  },
  {
    question: 'How long does the analysis take?',
    answer:
      'Typically under 60 seconds. Upload your files, and CheckPay cross-references your payslip against AVAC entries and current award rates to produce a detailed report.',
  },
  {
    question: 'Who is CheckPay for?',
    answer:
      'CheckPay is built for Queensland Health medical officers — from interns and junior house officers through to senior registrars — who want to verify their overtime payments are correct.',
  },
]
