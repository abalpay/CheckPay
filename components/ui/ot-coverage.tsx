'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CheckCircle, AlertTriangle, Clock, XCircle, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OTCoverageData } from '@/lib/jobs'

interface OTCoverageProps {
  data: OTCoverageData
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'covered':
      return <CheckCircle className="h-4 w-4 text-green-600" />
    case 'partially_covered':
      return <AlertTriangle className="h-4 w-4 text-amber-600" />
    case 'not_paid':
      return <XCircle className="h-4 w-4 text-red-600" />
    case 'future':
      return <Clock className="h-4 w-4 text-blue-600" />
    case 'out_of_period':
      return <Calendar className="h-4 w-4 text-gray-600" />
    default:
      return <Clock className="h-4 w-4 text-gray-600" />
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'covered':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'partially_covered':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'not_paid':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'future':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'out_of_period':
      return 'bg-gray-100 text-gray-800 border-gray-200'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

const getRowColor = (status: string) => {
  switch (status) {
    case 'covered':
      return 'bg-green-50'
    case 'partially_covered':
      return 'bg-amber-50'
    case 'not_paid':
      return 'bg-red-50'
    case 'future':
      return 'bg-blue-50'
    case 'out_of_period':
      return 'bg-gray-50'
    default:
      return ''
  }
}

const formatStatus = (status: string) => {
  return status.replace('_', ' ').toUpperCase()
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

export function OTCoverage({ data }: OTCoverageProps) {
  const { results, totals } = data

  // Calculate coverage percentage
  const coveragePercentage = totals.need > 0 ? (totals.paid / totals.need) * 100 : 0
  const isFullyCovered = coveragePercentage >= 100

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          OT Coverage Analysis
        </CardTitle>
        <CardDescription>
          Overtime coverage analysis from your documents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{totals.need}</div>
            <div className="text-sm text-muted-foreground">Hours Needed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{totals.paid}</div>
            <div className="text-sm text-muted-foreground">Hours Paid</div>
          </div>
          <div className="text-center">
            <div className={cn(
              "text-2xl font-bold",
              isFullyCovered ? "text-green-600" : "text-red-600"
            )}>
              {coveragePercentage.toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground">Coverage</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{results.length}</div>
            <div className="text-sm text-muted-foreground">Days Analyzed</div>
          </div>
        </div>

        {/* Status Summary */}
        <div className="flex flex-wrap gap-2">
          {totals.covered > 0 && (
            <Badge className={cn("flex items-center gap-1", getStatusColor('covered'))}>
              <CheckCircle className="h-3 w-3" />
              {totals.covered} Covered
            </Badge>
          )}
          {totals.partially_covered > 0 && (
            <Badge className={cn("flex items-center gap-1", getStatusColor('partially_covered'))}>
              <AlertTriangle className="h-3 w-3" />
              {totals.partially_covered} Partial
            </Badge>
          )}
          {totals.not_paid > 0 && (
            <Badge className={cn("flex items-center gap-1", getStatusColor('not_paid'))}>
              <XCircle className="h-3 w-3" />
              {totals.not_paid} Not Paid
            </Badge>
          )}
          {totals.future > 0 && (
            <Badge className={cn("flex items-center gap-1", getStatusColor('future'))}>
              <Clock className="h-3 w-3" />
              {totals.future} Future
            </Badge>
          )}
          {totals.out_of_period > 0 && (
            <Badge className={cn("flex items-center gap-1", getStatusColor('out_of_period'))}>
              <Calendar className="h-3 w-3" />
              {totals.out_of_period} Out of Period
            </Badge>
          )}
        </div>

        {/* Detailed Results Table */}
        <div>
          <h4 className="font-semibold mb-3">Daily Breakdown</h4>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Need</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, index) => (
                  <TableRow key={index} className={getRowColor(result.status)}>
                    <TableCell className="font-medium">
                      {formatDate(result.date)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {result.need}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {result.paid}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(result.status)}
                        <Badge className={cn("text-xs", getStatusColor(result.status))}>
                          {formatStatus(result.status)}
                        </Badge>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Notes Section */}
        {data.notes && data.notes.trim() && (
          <div className="bg-muted rounded-lg p-4">
            <h4 className="font-semibold mb-2">Analysis Notes</h4>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {data.notes}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
