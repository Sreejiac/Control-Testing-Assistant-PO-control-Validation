import React, { useMemo, useState } from 'react';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { formatCurrency, OWNER_OPTIONS } from '../lib/controlEngine';
import {
  EvidenceAssessment,
  FollowUpQuestion,
  PurchaseRecord,
  QuestionOwner,
  QuestionStatus,
  WorkpaperBrief,
} from '../types/evidence';

interface FollowUpQueueViewProps {
  records: PurchaseRecord[];
  assessments: Map<string, EvidenceAssessment>;
  questions: FollowUpQuestion[];
  onUpdateQuestion: (id: string, patch: Partial<FollowUpQuestion>) => void;
  onSelectRecord: (recordId: string) => void;
}

export const FollowUpQueueView: React.FC<FollowUpQueueViewProps> = ({
  records,
  assessments,
  questions,
  onUpdateQuestion,
  onSelectRecord,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | QuestionStatus>('all');
  const [ownerFilter, setOwnerFilter] = useState<'all' | QuestionOwner>('all');
  const [copiedOwner, setCopiedOwner] = useState<string | null>(null);
  const [brief, setBrief] = useState<WorkpaperBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);

  const recordById = useMemo(() => {
    const map = new Map<string, PurchaseRecord>();
    records.forEach((r) => map.set(r.id, r));
    return map;
  }, [records]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;
      if (ownerFilter !== 'all' && q.owner !== ownerFilter) return false;
      return true;
    });
  }, [questions, statusFilter, ownerFilter]);

  const groupedByOwner = useMemo(() => {
    const groups = new Map<QuestionOwner, FollowUpQuestion[]>();
    OWNER_OPTIONS.forEach((o) => groups.set(o, []));
    filteredQuestions.forEach((q) => {
      const list = groups.get(q.owner) ?? [];
      list.push(q);
      groups.set(q.owner, list);
    });
    return Array.from(groups.entries()).filter(([, list]) => list.length > 0);
  }, [filteredQuestions]);

  const handleCopyOwnerEmail = async (owner: QuestionOwner, ownerQuestions: FollowUpQuestion[]) => {
    const lines = [
      `Subject: Control Testing Evidence Follow-Up — Purchasing Policy (>$1,000)`,
      '',
      `Hello ${owner} Team,`,
      '',
      `As part of our purchasing control evidence review (policy requirement: managerial approval prior to payment for purchases over $1,000), could you please help clarify the following items?`,
      '',
    ];

    ownerQuestions.forEach((q, idx) => {
      const rec = recordById.get(q.recordId);
      const refLabel = rec
        ? `${rec.poNumber} (${rec.vendor}, ${formatCurrency(rec.purchaseAmount)})`
        : q.recordId;
      lines.push(`${idx + 1}. [${refLabel}]`);
      lines.push(`   ${q.question}`);
      lines.push('');
    });

    lines.push('Thank you for providing any supporting documentation or clarification.');
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopiedOwner(owner);
    setTimeout(() => setCopiedOwner(null), 2000);
  };

  const handleGenerateBrief = async () => {
    setBriefLoading(true);
    setBriefError(null);
    try {
      const res = await fetch('/api/workpaper/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records,
          assessments: Array.from(assessments.values()),
          questions,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate workpaper brief.');
      }
      setBrief(data);
    } catch (err) {
      setBriefError(err instanceof Error ? err.message : 'Unable to generate brief.');
    } finally {
      setBriefLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Workpaper Preparation Brief Panel */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Neutral Workpaper Preparation Brief
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Synthesizes evidence coverage, cross-transaction patterns, and grouped inquiry priorities without making a pass/fail determination.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateBrief}
            disabled={briefLoading || records.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {briefLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>{briefLoading ? 'Preparing Brief...' : 'Prepare Workpaper Brief'}</span>
          </button>
        </div>

        {briefError && (
          <div className="p-3 border border-red-200 bg-red-50 rounded-md text-xs text-red-700">
            {briefError}
          </div>
        )}

        {brief && (
          <div className="border-t border-slate-200 pt-4 space-y-4 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs font-semibold text-slate-900 mb-1">Scope Overview</h3>
                <p className="text-xs text-slate-700 leading-relaxed">{brief.scopeOverview}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-slate-900 mb-1">
                  Evidence Completeness Breakdown
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed">{brief.evidenceBreakdown}</p>
              </div>
            </div>

            {brief.keyPatterns.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-slate-900 mb-1.5">
                  Observed Evidence Patterns
                </h3>
                <ul className="space-y-1 text-xs text-slate-700">
                  {brief.keyPatterns.map((p, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-slate-400">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600">
              <strong className="text-slate-800">Reviewer Posture:</strong> {brief.reviewerReminder}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              ['all', 'All Inquiries'],
              ['open', 'Open'],
              ['sent', 'Inquiry Sent'],
              ['responded', 'Response Logged'],
              ['cleared', 'Cleared'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === key
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="owner-filter" className="text-xs text-slate-500">
            Target Owner:
          </label>
          <select
            id="owner-filter"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value as 'all' | QuestionOwner)}
            className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2.5 py-1.5"
          >
            <option value="all">All Owners</option>
            {OWNER_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Grouped Questions */}
      {groupedByOwner.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center text-sm text-slate-500">
          No follow-up questions match the selected filters.
        </div>
      ) : (
        <div className="space-y-5">
          {groupedByOwner.map(([owner, ownerQuestions]) => (
            <div key={owner} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{owner}</h3>
                  <p className="text-xs text-slate-500 font-mono tabular-nums">
                    {ownerQuestions.length} follow-up question
                    {ownerQuestions.length === 1 ? '' : 's'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyOwnerEmail(owner, ownerQuestions)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  {copiedOwner === owner ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Inquiry Email Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Inquiry Email</span>
                    </>
                  )}
                </button>
              </div>

              <div className="divide-y divide-slate-200">
                {ownerQuestions.map((q) => {
                  const rec = recordById.get(q.recordId);
                  return (
                    <div key={q.id} className="p-5 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {rec ? (
                          <button
                            type="button"
                            onClick={() => onSelectRecord(rec.id)}
                            className="text-xs font-mono font-medium text-indigo-700 hover:underline tabular-nums"
                          >
                            {rec.poNumber} · {rec.vendor} · {formatCurrency(rec.purchaseAmount)}
                          </button>
                        ) : (
                          <span className="text-xs font-mono text-slate-500">{q.recordId}</span>
                        )}

                        <select
                          value={q.status}
                          onChange={(e) =>
                            onUpdateQuestion(q.id, { status: e.target.value as QuestionStatus })
                          }
                          aria-label="Update inquiry status"
                          className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700"
                        >
                          <option value="open">Open</option>
                          <option value="sent">Inquiry Sent</option>
                          <option value="responded">Response Logged</option>
                          <option value="cleared">Cleared</option>
                        </select>
                      </div>

                      <p className="text-sm text-slate-900 leading-relaxed">{q.question}</p>
                      <p className="text-xs text-slate-500">{q.rationale}</p>

                      <input
                        type="text"
                        value={q.reviewerNote ?? ''}
                        onChange={(e) =>
                          onUpdateQuestion(q.id, { reviewerNote: e.target.value })
                        }
                        placeholder="Record owner response or supporting file reference..."
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-400"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
