import React, { useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { formatCurrency, OWNER_OPTIONS } from '../lib/controlEngine';
import {
  EvidenceAssessment,
  FollowUpQuestion,
  PurchaseRecord,
  QuestionOwner,
  QuestionStatus,
} from '../types/evidence';

interface TransactionDrawerProps {
  record: PurchaseRecord;
  assessment: EvidenceAssessment;
  questions: FollowUpQuestion[];
  allRecords: PurchaseRecord[];
  onClose: () => void;
  onUpdateRecord: (updated: PurchaseRecord) => void;
  onDeleteRecord: (id: string) => void;
  onAddQuestion: (q: Omit<FollowUpQuestion, 'id' | 'createdAt'>) => void;
  onUpdateQuestion: (id: string, patch: Partial<FollowUpQuestion>) => void;
  onDeleteQuestion: (id: string) => void;
  onSelectRelated: (id: string) => void;
}

export const TransactionDrawer: React.FC<TransactionDrawerProps> = ({
  record,
  assessment,
  questions,
  allRecords,
  onClose,
  onUpdateRecord,
  onDeleteRecord,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
  onSelectRelated,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<PurchaseRecord>(record);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionOwner, setNewQuestionOwner] = useState<QuestionOwner>('Accounts Payable');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [inquiryDraft, setInquiryDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync draft when selected record changes
  React.useEffect(() => {
    setDraft(record);
    setIsEditing(false);
    setInquiryDraft(null);
    setAiError(null);
    setConfirmDelete(false);
  }, [record]);

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateRecord(draft);
    setIsEditing(false);
  };

  const handleAddCustomQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newQuestionText.trim();
    if (!trimmed) return;
    onAddQuestion({
      recordId: record.id,
      question: trimmed,
      rationale: 'Added manually by compliance reviewer.',
      owner: newQuestionOwner,
      status: 'open',
      source: 'reviewer',
    });
    setNewQuestionText('');
  };

  const handleGenerateAiQuestions = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/evidence/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record, assessment }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to draft follow-up questions.');
      }

      if (Array.isArray(data.questions)) {
        data.questions.forEach(
          (q: { question: string; rationale: string; owner?: string }) => {
            const matchedOwner = OWNER_OPTIONS.includes(q.owner as QuestionOwner)
              ? (q.owner as QuestionOwner)
              : 'Accounts Payable';
            onAddQuestion({
              recordId: record.id,
              question: q.question,
              rationale: q.rationale,
              owner: matchedOwner,
              status: 'open',
              source: 'ai_assistant',
            });
          }
        );
      }

      if (data.inquiryDraftSubject && data.inquiryDraftBody) {
        setInquiryDraft({
          subject: data.inquiryDraftSubject,
          body: data.inquiryDraftBody,
        });
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to generate questions.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopyEmail = async () => {
    if (!inquiryDraft) return;
    const text = `Subject: ${inquiryDraft.subject}\n\n${inquiryDraft.body}`;
    await navigator.clipboard.writeText(text);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const relatedRecords = allRecords.filter((r) =>
    assessment.relatedRecordIds.includes(r.id)
  );

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <aside
        className="w-full max-w-2xl bg-white h-full border-l border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        aria-label={`Evidence details for ${record.poNumber}`}
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
              <span>{record.poNumber}</span>
              {record.invoiceNumber && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{record.invoiceNumber}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{assessment.classificationLabel}</span>
            </div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 truncate">
              {record.vendor}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {record.department} · Requested by {record.requesterName}
              {record.requesterTitle ? ` (${record.requesterTitle})` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsEditing((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Cancel Edit' : 'Update Evidence'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isEditing ? (
            <form
              onSubmit={handleSaveEdit}
              className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Update Transaction &amp; Approval Evidence
                </h3>
                <span className="text-xs text-slate-500">
                  Observations recalculate automatically
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Purchase Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={draft.purchaseAmount}
                    onChange={(e) =>
                      setDraft({ ...draft, purchaseAmount: Number(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Approved Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={draft.approvedAmount ?? ''}
                    placeholder="Blank if not documented"
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        approvedAmount: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Paid Amount ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={draft.paidAmount ?? ''}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        paidAmount: e.target.value === '' ? null : Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Approver Name
                  </label>
                  <input
                    type="text"
                    value={draft.approverName ?? ''}
                    placeholder="e.g., Rachel Lin"
                    onChange={(e) =>
                      setDraft({ ...draft, approverName: e.target.value || null })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Approver Role / Title
                  </label>
                  <input
                    type="text"
                    value={draft.approverRole ?? ''}
                    placeholder="e.g., Engineering Manager"
                    onChange={(e) =>
                      setDraft({ ...draft, approverRole: e.target.value || null })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Approval Date
                  </label>
                  <input
                    type="date"
                    value={draft.approvalDate ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, approvalDate: e.target.value || null })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Approval Time (optional)
                  </label>
                  <input
                    type="time"
                    value={draft.approvalTime ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, approvalTime: e.target.value || null })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={draft.paymentDate ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, paymentDate: e.target.value || null })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Time (optional)
                  </label>
                  <input
                    type="time"
                    value={draft.paymentTime ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, paymentTime: e.target.value || null })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Approval Channel
                  </label>
                  <input
                    type="text"
                    value={draft.approvalChannel ?? ''}
                    onChange={(e) =>
                      setDraft({ ...draft, approvalChannel: e.target.value || null })
                    }
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800"
                >
                  Save &amp; Re-Organize Evidence
                </button>
              </div>
            </form>
          ) : (
            /* 3-Stage Chronological Evidence Comparison */
            <div className="border border-slate-200 rounded-lg grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
              <div className="p-4">
                <div className="text-xs font-medium text-slate-500">1. Purchase / Invoice</div>
                <div className="mt-1.5 text-base font-semibold text-slate-900 font-mono tabular-nums">
                  {formatCurrency(record.purchaseAmount)}
                </div>
                <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
                  Date: {record.purchaseDate}
                </div>
                <div className="mt-1 text-xs text-slate-500">{record.description}</div>
              </div>

              <div className="p-4">
                <div className="text-xs font-medium text-slate-500">2. Managerial Approval</div>
                <div className="mt-1.5 text-base font-semibold text-slate-900 font-mono tabular-nums">
                  {record.approvedAmount != null
                    ? formatCurrency(record.approvedAmount)
                    : 'Not specified'}
                </div>
                <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
                  Date: {record.approvalDate || 'Missing'}
                  {record.approvalTime ? ` ${record.approvalTime}` : ''}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {record.approverName
                    ? `${record.approverName} (${record.approverRole || 'Role missing'})`
                    : 'No approver on file'}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs font-medium text-slate-500">3. Payment Settlement</div>
                <div className="mt-1.5 text-base font-semibold text-slate-900 font-mono tabular-nums">
                  {formatCurrency(record.paidAmount ?? record.purchaseAmount)}
                </div>
                <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
                  Date: {record.paymentDate || 'Missing'}
                  {record.paymentTime ? ` ${record.paymentTime}` : ''}
                </div>
                <div className="mt-1 text-xs text-slate-500 font-mono">
                  {record.paymentReference || 'Ref unspecified'}
                </div>
              </div>
            </div>
          )}

          {/* Related Potential Split Records */}
          {relatedRecords.length > 0 && (
            <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-4 space-y-2">
              <div className="text-xs font-semibold text-indigo-900">
                Linked Same-Vendor Orders (Potential Split Pattern)
              </div>
              <div className="space-y-1.5">
                {relatedRecords.map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    onClick={() => onSelectRelated(rel.id)}
                    className="w-full flex items-center justify-between text-left px-3 py-2 bg-white border border-indigo-200 rounded-md hover:bg-indigo-50 text-xs transition-colors"
                  >
                    <span className="font-mono font-medium text-slate-900">
                      {rel.poNumber} · {rel.purchaseDate} · {rel.description}
                    </span>
                    <span className="font-mono tabular-nums font-semibold text-indigo-700">
                      {formatCurrency(rel.purchaseAmount)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Factual Observations & Discrepancies */}
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-900 mb-2">
                Factual Observations
              </h3>
              <ul className="space-y-1.5 text-sm text-slate-700">
                {assessment.observations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-slate-400 select-none">•</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ul>
            </div>

            {assessment.discrepancies.length > 0 && (
              <div className="border-t border-slate-200 pt-4">
                <h3 className="text-xs font-semibold text-amber-800 mb-2">
                  Gaps, Timing Issues &amp; Inconsistencies
                </h3>
                <ul className="space-y-1.5 text-sm text-slate-800">
                  {assessment.discrepancies.map((disc, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-amber-600 select-none">•</span>
                      <span>{disc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {record.rawExcerpt && (
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-xs font-semibold text-slate-900">
                    Source Evidence Excerpt
                  </h3>
                  <span className="text-xs text-slate-500">
                    {record.evidenceSource}
                    {record.approvalChannel ? ` · ${record.approvalChannel}` : ''}
                  </span>
                </div>
                <pre className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {record.rawExcerpt}
                </pre>
              </div>
            )}
          </div>

          {/* Follow-Up Questions & Inquiry Preparation */}
          <div className="border-t border-slate-200 pt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Follow-Up Questions ({questions.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Targeted inquiries to clarify missing or inconsistent evidence.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateAiQuestions}
                disabled={aiLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{aiLoading ? 'Drafting...' : 'Draft Questions & Email'}</span>
              </button>
            </div>

            {aiError && (
              <div className="p-3 border border-red-200 bg-red-50 rounded-md text-xs text-red-700">
                {aiError}
              </div>
            )}

            {inquiryDraft && (
              <div className="border border-slate-300 bg-slate-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">
                    Ready-to-Send Inquiry Email Draft
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 whitespace-nowrap"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Draft</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="text-xs font-medium text-slate-800">
                  Subject: {inquiryDraft.subject}
                </div>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed bg-white p-3 border border-slate-200 rounded">
                  {inquiryDraft.body}
                </pre>
              </div>
            )}

            {questions.length === 0 ? (
              <div className="p-4 border border-slate-200 rounded-md text-xs text-slate-500">
                No follow-up questions logged for this transaction. Add one below if needed.
              </div>
            ) : (
              <div className="space-y-3">
                {questions.map((q) => (
                  <div
                    key={q.id}
                    className="border border-slate-200 rounded-lg p-3.5 bg-white space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-slate-900 leading-snug">{q.question}</p>
                      <button
                        type="button"
                        onClick={() => onDeleteQuestion(q.id)}
                        aria-label="Remove question"
                        className="p-1 text-slate-400 hover:text-red-600 rounded shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">{q.rationale}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <select
                        value={q.owner}
                        onChange={(e) =>
                          onUpdateQuestion(q.id, { owner: e.target.value as QuestionOwner })
                        }
                        aria-label="Question owner"
                        className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700"
                      >
                        {OWNER_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>

                      <select
                        value={q.status}
                        onChange={(e) =>
                          onUpdateQuestion(q.id, { status: e.target.value as QuestionStatus })
                        }
                        aria-label="Question status"
                        className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700"
                      >
                        <option value="open">Open</option>
                        <option value="sent">Inquiry Sent</option>
                        <option value="responded">Response Logged</option>
                        <option value="cleared">Cleared</option>
                      </select>

                      <span className="text-xs text-slate-400 ml-auto">
                        {q.source === 'ai_assistant'
                          ? 'AI-assisted draft'
                          : q.source === 'reviewer'
                          ? 'Reviewer added'
                          : 'Policy rule check'}
                      </span>
                    </div>

                    <input
                      type="text"
                      value={q.reviewerNote ?? ''}
                      onChange={(e) =>
                        onUpdateQuestion(q.id, { reviewerNote: e.target.value })
                      }
                      placeholder="Log response or reviewer note..."
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-400"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Add Custom Follow-Up Question */}
            <form onSubmit={handleAddCustomQuestion} className="space-y-2 pt-2">
              <label className="block text-xs font-medium text-slate-700">
                Add Custom Follow-Up Question
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  placeholder="Enter a follow-up question for the process owner..."
                  className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <select
                  value={newQuestionOwner}
                  onChange={(e) => setNewQuestionOwner(e.target.value as QuestionOwner)}
                  aria-label="New question owner"
                  className="px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-md text-slate-700"
                >
                  {OWNER_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </form>
          </div>

          {/* Delete Record Footer */}
          <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-700 font-medium">
                  Remove {record.poNumber} from this workpaper?
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteRecord(record.id)}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                >
                  Confirm Remove
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-slate-500 hover:text-red-700 transition-colors"
              >
                Remove record from workpaper
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
};
