import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ChevronRight,
  Clock,
  FilePlus2,
  GitFork,
  MinusCircle,
  Search,
} from 'lucide-react';
import { formatCurrency } from '../lib/controlEngine';
import {
  EvidenceAssessment,
  EvidenceClassification,
  FollowUpQuestion,
  PurchaseRecord,
} from '../types/evidence';

interface EvidenceMatrixProps {
  records: PurchaseRecord[];
  assessments: Map<string, EvidenceAssessment>;
  questions: FollowUpQuestion[];
  selectedRecordId: string | null;
  onSelectRecord: (id: string) => void;
  onNavigateToIntake: () => void;
  onLoadSample: () => void;
}

type FilterKey =
  | 'all'
  | 'needs_followup'
  | 'missing_approval'
  | 'timing_discrepancy'
  | 'inconsistent_incomplete'
  | 'potential_split'
  | 'evidence_observed'
  | 'threshold_exempt';

type SortKey = 'default' | 'amount_desc' | 'date_desc' | 'questions_desc';

function ClassificationText({
  classification,
  label,
}: {
  classification: EvidenceClassification;
  label: string;
}) {
  switch (classification) {
    case 'evidence_observed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'missing_approval':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'timing_discrepancy':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'inconsistent_incomplete':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'potential_split':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 whitespace-nowrap">
          <GitFork className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'threshold_exempt':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <MinusCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
  }
}

export const EvidenceMatrix: React.FC<EvidenceMatrixProps> = ({
  records,
  assessments,
  questions,
  selectedRecordId,
  onSelectRecord,
  onNavigateToIntake,
  onLoadSample,
}) => {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('default');

  const stats = useMemo(() => {
    let inScope = 0;
    let completeObserved = 0;
    let flagged = 0;
    let missingApproval = 0;
    let timingIssues = 0;
    let inconsistent = 0;
    let splitPatterns = 0;
    let underThreshold = 0;

    for (const r of records) {
      const a = assessments.get(r.id);
      if (!a) continue;
      if (a.inScope) inScope++;
      switch (a.classification) {
        case 'evidence_observed':
          completeObserved++;
          break;
        case 'missing_approval':
          missingApproval++;
          flagged++;
          break;
        case 'timing_discrepancy':
          timingIssues++;
          flagged++;
          break;
        case 'inconsistent_incomplete':
          inconsistent++;
          flagged++;
          break;
        case 'potential_split':
          splitPatterns++;
          flagged++;
          break;
        case 'threshold_exempt':
          underThreshold++;
          break;
      }
    }

    const openQuestions = questions.filter((q) => q.status === 'open' || q.status === 'sent').length;

    return {
      total: records.length,
      inScope,
      completeObserved,
      flagged,
      missingApproval,
      timingIssues,
      inconsistent,
      splitPatterns,
      underThreshold,
      openQuestions,
    };
  }, [records, assessments, questions]);

  const questionCountByRecord = useMemo(() => {
    const map = new Map<string, { open: number; total: number }>();
    for (const q of questions) {
      const curr = map.get(q.recordId) ?? { open: 0, total: 0 };
      curr.total++;
      if (q.status === 'open' || q.status === 'sent') {
        curr.open++;
      }
      map.set(q.recordId, curr);
    }
    return map;
  }, [questions]);

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = records.filter((r) => {
      const a = assessments.get(r.id);
      if (!a) return false;

      if (filter === 'needs_followup') {
        if (a.classification === 'evidence_observed' || a.classification === 'threshold_exempt') {
          return false;
        }
      } else if (filter !== 'all') {
        if (a.classification !== filter) return false;
      }

      if (q) {
        const hay = [
          r.poNumber,
          r.invoiceNumber ?? '',
          r.vendor,
          r.department,
          r.requesterName,
          r.approverName ?? '',
          r.description,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    if (sortBy === 'amount_desc') {
      return [...list].sort((a, b) => b.purchaseAmount - a.purchaseAmount);
    }
    if (sortBy === 'date_desc') {
      return [...list].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
    }
    if (sortBy === 'questions_desc') {
      return [...list].sort((a, b) => {
        const qa = questionCountByRecord.get(a.id)?.open ?? 0;
        const qb = questionCountByRecord.get(b.id)?.open ?? 0;
        return qb - qa;
      });
    }
    return list;
  }, [records, assessments, filter, searchQuery, sortBy, questionCountByRecord]);

  const filterTabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'All Records', count: stats.total },
    { key: 'needs_followup', label: 'Needs Follow-Up', count: stats.flagged },
    { key: 'missing_approval', label: 'Missing Approval', count: stats.missingApproval },
    { key: 'timing_discrepancy', label: 'Timing Discrepancy', count: stats.timingIssues },
    { key: 'inconsistent_incomplete', label: 'Inconsistent', count: stats.inconsistent },
    { key: 'potential_split', label: 'Potential Split', count: stats.splitPatterns },
    { key: 'evidence_observed', label: 'Evidence Observed', count: stats.completeObserved },
    { key: 'threshold_exempt', label: 'Under $1,000', count: stats.underThreshold },
  ];

  if (records.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
        <h2 className="text-lg font-semibold text-slate-900">No purchase evidence loaded</h2>
        <p className="mt-2 text-sm text-slate-600 max-w-lg mx-auto">
          Import an AP ledger CSV, paste raw email or Slack approval snippets for AI structuring, or load the sample purchasing workpaper to organize evidence and prepare follow-up questions.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onNavigateToIntake}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Import or Parse Evidence</span>
          </button>
          <button
            type="button"
            onClick={onLoadSample}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
          >
            Load Sample Workpaper
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Control Scope & Neutrality Statement */}
      <div className="bg-white border border-slate-200 rounded-lg px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Control Policy</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-700">Threshold: &gt; $1,000.00</span>
            <span aria-hidden="true">·</span>
            <span>Pre-Payment Managerial Approval</span>
          </div>
          <p className="text-sm font-medium text-slate-900">
            Rule: Every purchase over $1,000 must be approved by a manager before it is paid.
          </p>
        </div>
        <p className="text-xs text-slate-600 lg:text-right max-w-md">
          This workspace organizes evidence and drafts inquiry questions. Control pass/fail determinations remain strictly with the compliance reviewer.
        </p>
      </div>

      {/* 5-Column Factual Summary Strip */}
      <div className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs text-slate-500">Transactions Logged</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {stats.total}
          </div>
          <div className="mt-1 text-xs text-slate-500">Total sample population</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Over $1,000 (In-Scope)</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono tabular-nums">
            {stats.inScope}
          </div>
          <div className="mt-1 text-xs text-slate-500">Subject to policy rule</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Complete Evidence</div>
          <div className="mt-1.5 text-2xl font-semibold text-emerald-700 font-mono tabular-nums">
            {stats.completeObserved}
          </div>
          <div className="mt-1 text-xs text-slate-500">Pre-payment approval verified</div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Flagged for Follow-Up</div>
          <div className="mt-1.5 text-2xl font-semibold text-amber-700 font-mono tabular-nums">
            {stats.flagged}
          </div>
          <div className="mt-1 text-xs text-slate-500">Missing, timing, or inconsistent</div>
        </div>
        <div className="p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-500">Open Inquiries</div>
          <div className="mt-1.5 text-2xl font-semibold text-indigo-700 font-mono tabular-nums">
            {stats.openQuestions}
          </div>
          <div className="mt-1 text-xs text-slate-500">Pending reviewer follow-up</div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="p-4 border-b border-slate-200 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by PO, invoice, vendor, requester, or approver..."
                aria-label="Filter transactions"
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
              <label htmlFor="matrix-sort" className="text-xs text-slate-500 whitespace-nowrap">
                Sort:
              </label>
              <select
                id="matrix-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="default">Workpaper Order</option>
                <option value="amount_desc">Amount (High to Low)</option>
                <option value="date_desc">Purchase Date (Newest)</option>
                <option value="questions_desc">Open Questions (Most)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {filterTabs.map((tab) => {
              const active = filter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`ml-1.5 font-mono tabular-nums ${
                      active ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* High-Density Evidence Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-4 whitespace-nowrap">Transaction</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Vendor &amp; Dept</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Amount</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Approval &amp; Approver</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Sequence vs. Payment</th>
                <th className="py-2.5 px-4 whitespace-nowrap">Evidence Observation</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Follow-Ups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 px-4 text-center text-sm text-slate-500">
                    No transactions match your current filter or search query.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => {
                  const assessment = assessments.get(record.id);
                  if (!assessment) return null;
                  const qStats = questionCountByRecord.get(record.id) ?? { open: 0, total: 0 };
                  const isSelected = selectedRecordId === record.id;

                  let sequenceSummary = '—';
                  if (!assessment.inScope && assessment.classification !== 'potential_split') {
                    sequenceSummary = 'Exempt (<= $1,000)';
                  } else if (!record.approvalDate && !record.approverName) {
                    sequenceSummary = record.paymentDate
                      ? `Paid ${record.paymentDate} · No approval`
                      : 'No approval or payment date';
                  } else if (assessment.timingDeltaDays !== null) {
                    if (assessment.timingDeltaDays > 0) {
                      sequenceSummary = `+${assessment.timingDeltaDays}d post-payment`;
                    } else if (assessment.timingDeltaDays === 0) {
                      sequenceSummary =
                        record.approvalTime && record.paymentTime
                          ? `Same day (${record.approvalTime} vs ${record.paymentTime})`
                          : `Same day (${record.paymentDate})`;
                    } else {
                      sequenceSummary = `${Math.abs(assessment.timingDeltaDays)}d pre-payment`;
                    }
                  } else if (record.approvalDate && !record.paymentDate) {
                    sequenceSummary = `Approved ${record.approvalDate} · Unpaid/Unknown`;
                  }

                  return (
                    <tr
                      key={record.id}
                      onClick={() => onSelectRecord(record.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4 align-top">
                        <div className="font-mono text-xs font-medium text-slate-900 tabular-nums whitespace-nowrap">
                          {record.poNumber}
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                          {record.purchaseDate}
                          {record.invoiceNumber ? ` · ${record.invoiceNumber}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top max-w-[230px]">
                        <div className="font-medium text-slate-900 truncate">{record.vendor}</div>
                        <div className="text-xs text-slate-500 truncate">
                          {record.department} · {record.requesterName}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top text-right">
                        <div className="font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(record.purchaseAmount)}
                        </div>
                        {assessment.amountVariance !== null &&
                          Math.abs(assessment.amountVariance) > 0.01 && (
                            <div
                              className={`text-xs font-mono tabular-nums whitespace-nowrap ${
                                assessment.amountVariance > 0 ? 'text-amber-700' : 'text-slate-500'
                              }`}
                            >
                              {assessment.amountVariance > 0 ? '+' : ''}
                              {formatCurrency(assessment.amountVariance)} vs appr.
                            </div>
                          )}
                      </td>
                      <td className="py-3 px-4 align-top max-w-[210px]">
                        {record.approverName ? (
                          <>
                            <div className="text-slate-900 truncate">{record.approverName}</div>
                            <div className="text-xs text-slate-500 truncate">
                              {record.approverRole || 'Role unspecified'} ·{' '}
                              {record.approvalDate || 'No date'}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">No approver recorded</span>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="text-xs font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {sequenceSummary}
                        </div>
                        <div className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap">
                          {record.paymentDate ? `Paid ${record.paymentDate}` : 'Payment date missing'}
                        </div>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <ClassificationText
                          classification={assessment.classification}
                          label={assessment.classificationLabel}
                        />
                        {assessment.discrepancies.length > 0 && (
                          <div className="mt-0.5 text-xs text-slate-500 line-clamp-1 max-w-[240px]">
                            {assessment.discrepancies[0]}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <span
                            className={`text-xs font-mono tabular-nums ${
                              qStats.open > 0 ? 'font-medium text-indigo-700' : 'text-slate-400'
                            }`}
                          >
                            {qStats.open > 0 ? `${qStats.open} open` : qStats.total > 0 ? 'Cleared' : '0'}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
