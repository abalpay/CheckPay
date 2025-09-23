import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { CheckCircle, FileText, Calculator, ArrowLeft } from 'lucide-react'

interface ProcessingPageProps {
  params: Promise<{
    id: string
  }>
}

export default async function ProcessingPage({ params }: ProcessingPageProps) {
  const { id } = await params;

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl">
      <div className="mb-6">
        <Button variant="ghost" asChild>
          <Link href="/check/new" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Upload
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <CheckCircle className="h-6 w-6 text-green-600" />
            Analysis Complete (MVP Demo)
          </CardTitle>
          <CardDescription>
            Your documents have been processed successfully
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mock Results */}
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold text-green-800">Payment Status: Correct</h3>
              </div>
              <p className="text-sm text-green-700">
                Your overtime payments appear to be calculated correctly based on your AVAC forms.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-muted rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium">Documents Processed</span>
                </div>
                <div className="text-2xl font-bold">4</div>
                <div className="text-xs text-muted-foreground">1 payslip + 3 AVAC forms</div>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="h-4 w-4 text-purple-600" />
                  <span className="text-sm font-medium">Hours Verified</span>
                </div>
                <div className="text-2xl font-bold">4.0</div>
                <div className="text-xs text-muted-foreground">Base overtime hours</div>
              </div>
            </div>

            {/* Mock Analysis Details */}
            <div className="border rounded-lg p-4">
              <h4 className="font-semibold mb-3">Analysis Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Expected base overtime:</span>
                  <span className="font-medium">4.0 hours</span>
                </div>
                <div className="flex justify-between">
                  <span>Actual overtime paid:</span>
                  <span className="font-medium">4.0 hours</span>
                </div>
                <div className="flex justify-between">
                  <span>Discrepancy:</span>
                  <span className="font-medium text-green-600">$0.00</span>
                </div>
              </div>
            </div>
          </div>

          {/* MVP Notice */}
          <div className="border-blue-200 bg-blue-50 border rounded-lg p-4">
            <div className="text-sm text-blue-800">
              <strong>MVP Demo:</strong> This is a simulated result. In the full version, 
              this page would show real analysis results from processing your actual documents.
            </div>
          </div>

          {/* Debug Info */}
          <div className="text-xs text-muted-foreground border rounded p-2 bg-muted/50">
            <strong>Debug Info:</strong> Report ID: {id}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button asChild className="flex-1">
              <Link href="/check/new">
                Check Another Pay Period
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard">
                Back to Home
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
