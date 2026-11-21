import { EvidenceAssessment, FollowUpQuestion, PurchaseRecord } from '../types/evidence';
import { formatCurrency } from './controlEngine';

function parseCsvRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function toNumberOrNull(val?: string): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseCsvToRecords(csvText: string, sourceLabel = 'CSV Import'): PurchaseRecord[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, '_'));
  const records: PurchaseRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? '';
    });

    const get = (...keys: string[]) => {
      for (const k of keys) {
        if (row[k] !== undefined && row[k] !== '') return row[k];
      }
      return '';
    };

    const purchaseAmount =
      toNumberOrNull(get('purchase_amount', 'amount', 'invoice_amount', 'total')) ?? 0;

    records.push({
      id: `csv-${Date.now()}-${i}`,
      poNumber: get('po_number', 'po', 'purchase_id', 'id') || `ROW-${i}`,
      invoiceNumber: get('invoice_number', 'invoice', 'inv_no') || undefined,
      vendor: get('vendor', 'supplier', 'merchant') || 'Unspecified Vendor',
      department: get('department', 'dept', 'cost_center') || 'General',
      description: get('description', 'memo', 'item', 'notes') || 'Imported transaction',
      requesterName: get('requester_name', 'requester', 'requested_by') || 'Unknown Requester',
      requesterTitle: get('requester_title') || undefined,
      purchaseDate: get('purchase_date', 'date', 'order_date') || new Date().toISOString().slice(0, 10),
      purchaseAmount,
      approvedAmount: toNumberOrNull(get('approved_amount', 'approval_amount')),
      paidAmount: toNumberOrNull(get('paid_amount', 'payment_amount')) ?? purchaseAmount,
      approvalDate: get('approval_date', 'approved_date') || null,
      approvalTime: get('approval_time') || null,
      approverName: get('approver_name', 'approver', 'approved_by') || null,
      approverRole: get('approver_role', 'approver_title', 'role') || null,
      approvalChannel: get('approval_channel', 'channel') || (get('approver_name', 'approver') ? 'CSV Record' : 'None listed'),
      paymentDate: get('payment_date', 'paid_date') || null,
      paymentTime: get('payment_time') || null,
      paymentReference: get('payment_reference', 'payment_ref') || null,
      evidenceSource: sourceLabel,
      rawExcerpt: lines[i],
    });
  }

  return records;
}

function csvEscape(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportWorkpaperCsv(
  records: PurchaseRecord[],
  assessments: Map<string, EvidenceAssessment>,
  questions: FollowUpQuestion[]
): string {
  const headers = [
    'PO Number',
    'Invoice Number',
    'Purchase Date',
    'Vendor',
    'Department',
    'Requester',
    'Purchase Amount',
    'Approved Amount',
    'Paid Amount',
    'Approver Name',
    'Approver Role',
    'Approval Date',
    'Payment Date',
    'In Scope (>$1,000)',
    'Evidence Organization Status',
    'Factual Observations & Discrepancies',
    'Follow-Up Questions',
  ];

  const rows = records.map((r) => {
    const a = assessments.get(r.id);
    const qs = questions.filter((q) => q.recordId === r.id);
    return [
      r.poNumber,
      r.invoiceNumber ?? '',
      r.purchaseDate,
      r.vendor,
      r.department,
      r.requesterName,
      r.purchaseAmount.toFixed(2),
      r.approvedAmount != null ? r.approvedAmount.toFixed(2) : '',
      r.paidAmount != null ? r.paidAmount.toFixed(2) : '',
      r.approverName ?? '',
      r.approverRole ?? '',
      r.approvalDate ?? '',
      r.paymentDate ?? '',
      a?.inScope ? 'Yes' : 'No',
      a?.classificationLabel ?? '',
      [...(a?.observations ?? []), ...(a?.discrepancies ?? [])].join(' | '),
      qs.map((q) => `[${q.owner} - ${q.status}] ${q.question}`).join(' | '),
    ]
      .map(csvEscape)
      .join(',');
  });

  return [headers.map(csvEscape).join(','), ...rows].join('\n');
}

export function exportWorkpaperMarkdown(
  records: PurchaseRecord[],
  assessments: Map<string, EvidenceAssessment>,
  questions: FollowUpQuestion[]
): string {
  const inScopeCount = Array.from(assessments.values()).filter((a) => a.inScope).length;
  const followUpCount = Array.from(assessments.values()).filter(
    (a) => a.classification !== 'evidence_observed' && a.classification !== 'threshold_exempt'
  ).length;

  const lines: string[] = [
    '# Control Testing Evidence Workpaper',
    '',
    '**Control Rule Under Review:** Every purchase over $1,000 must be approved by a manager before it is paid.',
    '**Reviewer Posture:** Evidence organization and follow-up inquiry preparation only. Control pass/fail determination is strictly reserved for the compliance reviewer.',
    '',
    `- **Total Transactions Reviewed:** ${records.length}`,
    `- **In-Scope Transactions (>$1,000):** ${inScopeCount}`,
    `- **Transactions Requiring Follow-Up:** ${followUpCount}`,
    `- **Total Follow-Up Questions:** ${questions.length}`,
    '',
    '## Evidence Matrix',
    '',
  ];

  for (const r of records) {
    const a = assessments.get(r.id);
    const qs = questions.filter((q) => q.recordId === r.id);
    lines.push(`### ${r.poNumber} — ${r.vendor} (${formatCurrency(r.purchaseAmount)})`);
    lines.push(`- **Organization Category:** ${a?.classificationLabel ?? 'Unclassified'}`);
    lines.push(`- **Department / Requester:** ${r.department} · ${r.requesterName}`);
    lines.push(
      `- **Timeline:** Purchase ${r.purchaseDate} · Approval ${r.approvalDate ?? 'Missing'}${r.approverName ? ` (${r.approverName}, ${r.approverRole ?? 'Role unspecified'})` : ''} · Payment ${r.paymentDate ?? 'Missing'}`
    );
    if (a?.observations.length) {
      lines.push(`- **Observations:** ${a.observations.join(' ')}`);
    }
    if (a?.discrepancies.length) {
      lines.push(`- **Discrepancies / Gaps:** ${a.discrepancies.join(' ')}`);
    }
    if (qs.length) {
      lines.push('- **Follow-Up Questions:**');
      qs.forEach((q) => {
        lines.push(`  - [${q.owner} · ${q.status.toUpperCase()}] ${q.question}`);
        if (q.reviewerNote) {
          lines.push(`    - *Reviewer Note:* ${q.reviewerNote}`);
        }
      });
    }
    lines.push('');
  }

  return lines.join('\n');
}
