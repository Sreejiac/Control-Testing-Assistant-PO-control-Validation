import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Upload,
} from 'lucide-react';
import { SAMPLE_RAW_SNIPPETS } from '../data/sampleWorkpaper';
import { assessRecords, formatCurrency, OWNER_OPTIONS } from '../lib/controlEngine';
import { parseCsvToRecords } from '../lib/csvUtils';
import { FollowUpQuestion, PurchaseRecord, QuestionOwner } from '../types/evidence';

interface IntakeParseViewProps {
  onImportRecords: (
    newRecords: PurchaseRecord[],
    extraQuestions?: Omit<FollowUpQuestion, 'id' | 'createdAt'>[]
  ) => void;
  onNavigateToMatrix: () => void;
}

interface ParsedApiResponse {
  extractionNotes: string;
  records: Array<
    Omit<PurchaseRecord, 'id' | 'evidenceSource'> & {
      aiQuestions?: Array<{ question: string; rationale: string; owner: string }>;
    }
  >;
}

export const IntakeParseView: React.FC<IntakeParseViewProps> = ({
  onImportRecords,
  onNavigateToMatrix,
}) => {
  const [rawText, setRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    mimeType: string;
    base64?: string;
  } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [extractionNotes, setExtractionNotes] = useState<string | null>(null);
  const [stagedRecords, setStagedRecords] = useState<PurchaseRecord[]>([]);
  const [stagedAiQuestions, setStagedAiQuestions] = useState<
    Omit<FollowUpQuestion, 'id' | 'createdAt'>[]
  >([]);

  // Manual entry form state
  const [manualPo, setManualPo] = useState('');
  const [manualVendor, setManualVendor] = useState('');
  const [manualDept, setManualDept] = useState('');
  const [manualRequester, setManualRequester] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualDate, setManualDate] = useState('2026-11-15');
  const [manualAmount, setManualAmount] = useState('');
  const [manualApprovedAmount, setManualApprovedAmount] = useState('');
  const [manualApprover, setManualApprover] = useState('');
  const [manualApproverRole, setManualApproverRole] = useState('');
  const [manualApprovalDate, setManualApprovalDate] = useState('');
  const [manualPaymentDate, setManualPaymentDate] = useState('');
  const [manualAddedNotice, setManualAddedNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const stagedAssessments = useMemo(
    () => assessRecords(stagedRecords),
    [stagedRecords]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    const isTextLike = ['csv', 'txt', 'json', 'md', 'log', 'tsv'].includes(ext);

    if (isTextLike) {
      const content = await file.text();
      if (ext === 'csv') {
        const directRecords = parseCsvToRecords(content, `CSV: ${file.name}`);
        if (directRecords.length > 0) {
          setStagedRecords(directRecords);
          setStagedAiQuestions([]);
          setExtractionNotes(
            `Parsed ${directRecords.length} transaction rows directly from CSV "${file.name}". Review the staged observations below before adding to your workpaper.`
          );
          setSelectedFile(null);
          return;
        }
      }
      setRawText(content);
      setSelectedFile({ name: file.name, mimeType: 'text/plain' });
      return;
    }

    // Binary image or PDF for multimodal Gemini extraction
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setSelectedFile({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleAiParse = async () => {
    if (!rawText.trim() && !selectedFile?.base64) {
      setParseError('Paste raw evidence text or upload a file before parsing.');
      return;
    }

    // If it looks like a pure CSV pasted directly, offer instant deterministic parse OR AI parse
    setParsing(true);
    setParseError(null);

    try {
      const res = await fetch('/api/evidence/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: rawText.trim() || undefined,
          fileBase64: selectedFile?.base64,
          mimeType: selectedFile?.mimeType,
          fileName: selectedFile?.name,
        }),
      });
      const data: ParsedApiResponse & { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Evidence parsing failed.');
      }

      const timestamp = Date.now();
      const normalizedRecords: PurchaseRecord[] = (data.records ?? []).map((rec, idx) => ({
        id: `ai-${timestamp}-${idx}`,
        poNumber: rec.poNumber || `EXT-${idx + 1}`,
        invoiceNumber: rec.invoiceNumber ?? undefined,
        vendor: rec.vendor || 'Unspecified Vendor',
        department: rec.department || 'General',
        description: rec.description || 'Extracted purchase record',
        requesterName: rec.requesterName || 'Unknown Requester',
        requesterTitle: rec.requesterTitle ?? undefined,
        purchaseDate: rec.purchaseDate || new Date().toISOString().slice(0, 10),
        purchaseAmount: Number(rec.purchaseAmount) || 0,
        approvedAmount:
          rec.approvedAmount !== null && rec.approvedAmount !== undefined
            ? Number(rec.approvedAmount)
            : null,
        paidAmount:
          rec.paidAmount !== null && rec.paidAmount !== undefined
            ? Number(rec.paidAmount)
            : Number(rec.purchaseAmount) || 0,
        approvalDate: rec.approvalDate ?? null,
        approvalTime: rec.approvalTime ?? null,
        approverName: rec.approverName ?? null,
        approverRole: rec.approverRole ?? null,
        approvalChannel: rec.approvalChannel ?? null,
        paymentDate: rec.paymentDate ?? null,
        paymentTime: rec.paymentTime ?? null,
        paymentReference: rec.paymentReference ?? null,
        evidenceSource: selectedFile?.name ? `AI Extract (${selectedFile.name})` : 'AI Text Extract',
        rawExcerpt: rec.rawExcerpt || rawText.slice(0, 300),
      }));

      const extraQuestions: Omit<FollowUpQuestion, 'id' | 'createdAt'>[] = [];
      (data.records ?? []).forEach((rec, idx) => {
        const recordId = normalizedRecords[idx].id;
        (rec.aiQuestions ?? []).forEach((q) => {
          const owner = OWNER_OPTIONS.includes(q.owner as QuestionOwner)
            ? (q.owner as QuestionOwner)
            : 'Accounts Payable';
          extraQuestions.push({
            recordId,
            question: q.question,
            rationale: q.rationale,
            owner,
            status: 'open',
            source: 'ai_assistant',
          });
        });
      });

      setStagedRecords(normalizedRecords);
      setStagedAiQuestions(extraQuestions);
      setExtractionNotes(data.extractionNotes || null);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Unable to parse evidence.');
    } finally {
      setParsing(false);
    }
  };

  const handleCommitStaged = () => {
    if (stagedRecords.length === 0) return;
    onImportRecords(stagedRecords, stagedAiQuestions);
    setStagedRecords([]);
    setStagedAiQuestions([]);
    setExtractionNotes(null);
    setRawText('');
    setSelectedFile(null);
    onNavigateToMatrix();
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(manualAmount);
    if (!manualPo.trim() || !manualVendor.trim() || !Number.isFinite(amountNum)) {
      return;
    }

    const newRec: PurchaseRecord = {
      id: `manual-${Date.now()}`,
      poNumber: manualPo.trim(),
      vendor: manualVendor.trim(),
      department: manualDept.trim() || 'General',
      description: manualDesc.trim() || 'Manual evidence entry',
      requesterName: manualRequester.trim() || 'Unknown Requester',
      purchaseDate: manualDate || new Date().toISOString().slice(0, 10),
      purchaseAmount: amountNum,
      approvedAmount: manualApprovedAmount !== '' ? Number(manualApprovedAmount) : null,
      paidAmount: amountNum,
      approvalDate: manualApprovalDate || null,
      approverName: manualApprover.trim() || null,
      approverRole: manualApproverRole.trim() || null,
      approvalChannel: manualApprover.trim() ? 'Manual Entry' : 'None recorded',
      paymentDate: manualPaymentDate || null,
      evidenceSource: 'Manual Reviewer Entry',
    };

    onImportRecords([newRec]);
    setManualAddedNotice(`${newRec.poNumber} (${formatCurrency(newRec.purchaseAmount)}) added to workpaper.`);
    setManualPo('');
    setManualVendor('');
    setManualDesc('');
    setManualAmount('');
    setManualApprovedAmount('');
    setManualApprover('');
    setManualApproverRole('');
    setManualApprovalDate('');
    setManualPaymentDate('');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: AI & CSV Intake */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Extract &amp; Organize Raw Evidence
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Paste AP emails, Slack approval threads, invoice notes, or upload a CSV, text file, PDF, or receipt screenshot.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.json,.md,.pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Evidence File</span>
            </button>
          </div>

          {/* Sample Raw Packets */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">
              Try a sample raw evidence packet:
            </div>
            <div className="flex flex-wrap gap-2">
              {SAMPLE_RAW_SNIPPETS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    setRawText(sample.content);
                    setSelectedFile(null);
                    setParseError(null);
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {selectedFile && (
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-xs">
              <div className="flex items-center gap-2 text-slate-700">
                <FileText className="w-4 h-4 text-slate-500" />
                <span className="font-medium">{selectedFile.name}</span>
                <span className="text-slate-400">({selectedFile.mimeType})</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="text-slate-500 hover:text-slate-900"
              >
                Clear
              </button>
            </div>
          )}

          <div>
            <label htmlFor="raw-evidence-input" className="sr-only">
              Raw evidence text
            </label>
            <textarea
              id="raw-evidence-input"
              rows={9}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste invoice details, PO logs, approval emails, Slack messages, or CSV rows here..."
              className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white"
            />
          </div>

          {parseError && (
            <div className="p-3 border border-red-200 bg-red-50 rounded-md text-xs text-red-700">
              {parseError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-xs text-slate-500">
              Extracts factual fields and follow-up inquiries without issuing a pass/fail verdict.
            </span>
            <div className="flex items-center gap-2">
              {rawText.includes(',') && rawText.includes('\n') && (
                <button
                  type="button"
                  onClick={() => {
                    const direct = parseCsvToRecords(rawText, 'Direct CSV Paste');
                    if (direct.length > 0) {
                      setStagedRecords(direct);
                      setStagedAiQuestions([]);
                      setExtractionNotes(
                        `Parsed ${direct.length} rows deterministically as CSV.`
                      );
                    } else {
                      setParseError('Could not detect CSV header and rows. Try "Extract with AI" instead.');
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Parse as CSV</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleAiParse}
                disabled={parsing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {parsing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>{parsing ? 'Extracting Evidence...' : 'Extract & Structure with AI'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Manual Transaction Entry */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Log Individual Transaction
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Add a single purchase and approval record directly into the active workpaper.
            </p>
          </div>

          {manualAddedNotice && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{manualAddedNotice}</span>
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  PO / Reference *
                </label>
                <input
                  type="text"
                  required
                  value={manualPo}
                  onChange={(e) => setManualPo(e.target.value)}
                  placeholder="PO-2026-0991"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Purchase Amount ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="1450.00"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono text-xs tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Vendor Name *
              </label>
              <input
                type="text"
                required
                value={manualVendor}
                onChange={(e) => setManualVendor(e.target.value)}
                placeholder="Acme Cloud Services"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Department
                </label>
                <input
                  type="text"
                  value={manualDept}
                  onChange={(e) => setManualDept(e.target.value)}
                  placeholder="Operations"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Requester Name
                </label>
                <input
                  type="text"
                  value={manualRequester}
                  onChange={(e) => setManualRequester(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
                placeholder="Annual workstation backup licenses"
                className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Payment Date
                </label>
                <input
                  type="date"
                  value={manualPaymentDate}
                  onChange={(e) => setManualPaymentDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Approver Name
                </label>
                <input
                  type="text"
                  value={manualApprover}
                  onChange={(e) => setManualApprover(e.target.value)}
                  placeholder="Leave blank if missing"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Approver Role
                </label>
                <input
                  type="text"
                  value={manualApproverRole}
                  onChange={(e) => setManualApproverRole(e.target.value)}
                  placeholder="e.g., Finance Manager"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Approval Date
                </label>
                <input
                  type="date"
                  value={manualApprovalDate}
                  onChange={(e) => setManualApprovalDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Approved Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={manualApprovedAmount}
                  onChange={(e) => setManualApprovedAmount(e.target.value)}
                  placeholder="Blank if unspecified"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono text-xs tabular-nums"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Record to Workpaper</span>
            </button>
          </form>
        </div>
      </div>

      {/* Staged Extracted Preview */}
      {stagedRecords.length > 0 && (
        <div className="bg-white border border-slate-300 rounded-lg p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Staged Extraction Preview ({stagedRecords.length} transactions)
              </h3>
              {extractionNotes && (
                <p className="mt-1 text-xs text-slate-600">{extractionNotes}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setStagedRecords([]);
                  setStagedAiQuestions([]);
                  setExtractionNotes(null);
                }}
                className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
              >
                Discard Preview
              </button>
              <button
                type="button"
                onClick={handleCommitStaged}
                className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap"
              >
                Add {stagedRecords.length} Records to Workpaper
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-2 px-3">PO / Ref</th>
                  <th className="py-2 px-3">Vendor</th>
                  <th className="py-2 px-3 text-right">Amount</th>
                  <th className="py-2 px-3">Approval</th>
                  <th className="py-2 px-3">Payment</th>
                  <th className="py-2 px-3">Initial Observation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stagedRecords.map((rec) => {
                  const a = stagedAssessments.get(rec.id);
                  return (
                    <tr key={rec.id}>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                        {rec.poNumber}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">
                        {rec.vendor}
                        <div className="text-slate-500">{rec.requesterName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-900 whitespace-nowrap">
                        {formatCurrency(rec.purchaseAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {rec.approverName
                          ? `${rec.approverName} (${rec.approvalDate || 'no date'})`
                          : 'None extracted'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {rec.paymentDate || 'Missing'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        <span className="font-medium">{a?.classificationLabel}</span>
                        {a?.discrepancies[0] && (
                          <div className="text-slate-500 mt-0.5">{a.discrepancies[0]}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
