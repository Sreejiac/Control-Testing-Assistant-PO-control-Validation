import {
  EvidenceAssessment,
  EvidenceClassification,
  FollowUpQuestion,
  PurchaseRecord,
  QuestionOwner,
} from '../types/evidence';

export const POLICY_THRESHOLD = 1000;

const MANAGER_ROLE_KEYWORDS = [
  'manager',
  'director',
  'vp',
  'vice president',
  'head',
  'chief',
  'cfo',
  'coo',
  'cto',
  'ceo',
  'controller',
  'lead',
  'supervisor',
  'partner',
];

function normalizeText(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeVendor(vendor: string): string {
  return vendor
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|gmbh|plc)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function parseDateMs(dateStr?: string | null, timeStr?: string | null): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const isoCandidate = timeStr && /^\d{1,2}:\d{2}/.test(timeStr.trim())
    ? `${trimmed}T${timeStr.trim().padStart(5, '0')}:00`
    : `${trimmed}T00:00:00`;
  const parsed = Date.parse(isoCandidate);
  if (Number.isNaN(parsed)) {
    const fallback = Date.parse(trimmed);
    return Number.isNaN(fallback) ? null : fallback;
  }
  return parsed;
}

function diffDays(dateA: string, dateB: string): number | null {
  const msA = parseDateMs(dateA);
  const msB = parseDateMs(dateB);
  if (msA === null || msB === null) return null;
  return Math.round((msA - msB) / (1000 * 60 * 60 * 24));
}

function isManagerialRole(role?: string | null): 'yes' | 'no' | 'unknown' {
  const norm = normalizeText(role);
  if (!norm || norm === 'unknown' || norm === 'missing' || norm === 'n/a') {
    return 'unknown';
  }
  if (MANAGER_ROLE_KEYWORDS.some((kw) => norm.includes(kw))) {
    return 'yes';
  }
  return 'no';
}

export function formatCurrency(amount?: number | null): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return '—';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function assessRecords(
  records: PurchaseRecord[],
  threshold = POLICY_THRESHOLD
): Map<string, EvidenceAssessment> {
  const assessments = new Map<string, EvidenceAssessment>();

  // 1. Pre-compute potential split-purchase clusters for records <= threshold
  const splitClusters = new Map<string, string[]>();
  const underOrEqual = records.filter((r) => r.purchaseAmount <= threshold);

  for (let i = 0; i < underOrEqual.length; i++) {
    const a = underOrEqual[i];
    const normA = normalizeVendor(a.vendor);
    if (!normA) continue;

    const cluster: PurchaseRecord[] = [a];
    for (let j = 0; j < underOrEqual.length; j++) {
      if (i === j) continue;
      const b = underOrEqual[j];
      if (normalizeVendor(b.vendor) !== normA) continue;
      const dayGap = diffDays(a.purchaseDate, b.purchaseDate);
      if (dayGap !== null && Math.abs(dayGap) <= 3) {
        cluster.push(b);
      }
    }

    if (cluster.length > 1) {
      const combined = cluster.reduce((sum, item) => sum + item.purchaseAmount, 0);
      if (combined > threshold) {
        splitClusters.set(
          a.id,
          cluster.filter((c) => c.id !== a.id).map((c) => c.id)
        );
      }
    }
  }

  // 2. Assess each record objectively without deciding pass/fail
  for (const record of records) {
    const effectiveAmount = Math.max(
      record.purchaseAmount,
      record.paidAmount ?? 0
    );
    const inScope = effectiveAmount > threshold;
    const isBoundaryAmount =
      Math.abs(record.purchaseAmount - threshold) < 0.005 ||
      (record.paidAmount !== null &&
        record.paidAmount !== undefined &&
        Math.abs(record.paidAmount - threshold) < 0.005);

    const observations: string[] = [];
    const discrepancies: string[] = [];
    const missingFields: string[] = [];
    const suggestedQuestions: Omit<FollowUpQuestion, 'id' | 'createdAt'>[] = [];
    const relatedRecordIds = splitClusters.get(record.id) ?? [];

    let timingDeltaDays: number | null = null;
    let amountVariance: number | null = null;

    // Under or at threshold handling
    if (!inScope) {
      if (isBoundaryAmount) {
        observations.push(
          `Transaction amount (${formatCurrency(record.purchaseAmount)}) is exactly at the ${formatCurrency(threshold)} threshold.`
        );
        suggestedQuestions.push({
          recordId: record.id,
          question: `Does company policy apply the managerial approval requirement strictly to purchases over ${formatCurrency(threshold)}, or are purchases of exactly ${formatCurrency(threshold)} also subject to review?`,
          rationale: `Purchase ${record.poNumber} is recorded at exactly ${formatCurrency(threshold)}.`,
          owner: 'Procurement',
          status: 'open',
          source: 'rule_engine',
        });
      } else {
        observations.push(
          `Purchase amount (${formatCurrency(record.purchaseAmount)}) does not exceed the ${formatCurrency(threshold)} control threshold.`
        );
      }

      if (relatedRecordIds.length > 0) {
        const peers = records.filter((r) => relatedRecordIds.includes(r.id));
        const combinedTotal =
          record.purchaseAmount +
          peers.reduce((sum, p) => sum + p.purchaseAmount, 0);
        const peerLabels = peers.map((p) => `${p.poNumber} (${formatCurrency(p.purchaseAmount)})`).join(', ');

        discrepancies.push(
          `Same-vendor proximity: combined with ${peerLabels} within 3 days, aggregate spend is ${formatCurrency(combinedTotal)}.`
        );
        observations.push(
          `Individual transaction is under ${formatCurrency(threshold)}, but aggregate vendor spend within 3 days exceeds ${formatCurrency(threshold)}.`
        );
        suggestedQuestions.push({
          recordId: record.id,
          question: `Do ${record.poNumber} (${formatCurrency(record.purchaseAmount)}) and ${peerLabels} represent independent business needs, or were they split across separate orders below the ${formatCurrency(threshold)} approval threshold?`,
          rationale: `Aggregate vendor spend with ${record.vendor} reached ${formatCurrency(combinedTotal)} within a 3-day window.`,
          owner: 'Requester',
          status: 'open',
          source: 'rule_engine',
        });

        assessments.set(record.id, {
          recordId: record.id,
          inScope: false,
          isBoundaryAmount,
          classification: 'potential_split',
          classificationLabel: 'Potential Split Pattern',
          observations,
          discrepancies,
          missingFields,
          timingDeltaDays: null,
          amountVariance: null,
          relatedRecordIds,
          suggestedQuestions,
        });
        continue;
      }

      assessments.set(record.id, {
        recordId: record.id,
        inScope: false,
        isBoundaryAmount,
        classification: isBoundaryAmount ? 'inconsistent_incomplete' : 'threshold_exempt',
        classificationLabel: isBoundaryAmount
          ? 'Exact Threshold Boundary'
          : 'Under $1,000 Threshold',
        observations,
        discrepancies,
        missingFields,
        timingDeltaDays: null,
        amountVariance: null,
        relatedRecordIds: [],
        suggestedQuestions,
      });
      continue;
    }

    // In-Scope (> $1,000) analysis
    observations.push(
      `Purchase amount (${formatCurrency(effectiveAmount)}) exceeds the ${formatCurrency(threshold)} policy threshold.`
    );

    const hasApprover = Boolean(record.approverName && record.approverName.trim());
    const hasApprovalDate = Boolean(record.approvalDate && record.approvalDate.trim());
    const hasPaymentDate = Boolean(record.paymentDate && record.paymentDate.trim());

    if (!hasApprover) missingFields.push('Approver Name');
    if (!hasApprovalDate) missingFields.push('Approval Date');
    if (!record.approverRole || !record.approverRole.trim()) {
      missingFields.push('Approver Role / Title');
    }
    if (!hasPaymentDate) missingFields.push('Payment Date');

    // Missing approval completely
    if (!hasApprover && !hasApprovalDate) {
      discrepancies.push('No managerial approval record or approver identity is linked to this purchase.');
      suggestedQuestions.push({
        recordId: record.id,
        question: `Can Accounts Payable or ${record.requesterName} provide documented managerial approval (ERP workflow log, signed form, or email) dated prior to payment for ${record.poNumber} (${formatCurrency(effectiveAmount)})?`,
        rationale: `Purchase exceeds ${formatCurrency(threshold)} and currently lacks approval evidence.`,
        owner: 'Accounts Payable',
        status: 'open',
        source: 'rule_engine',
      });
      if (hasPaymentDate) {
        suggestedQuestions.push({
          recordId: record.id,
          question: `What documentation or exception override allowed payment ${record.paymentReference || 'disbursement'} on ${record.paymentDate} to be released without a linked manager approval in the system?`,
          rationale: `Payment date (${record.paymentDate}) is recorded with no corresponding approval record.`,
          owner: 'Accounts Payable',
          status: 'open',
          source: 'rule_engine',
        });
      }

      assessments.set(record.id, {
        recordId: record.id,
        inScope: true,
        isBoundaryAmount,
        classification: 'missing_approval',
        classificationLabel: 'Missing Approval Evidence',
        observations,
        discrepancies,
        missingFields,
        timingDeltaDays: null,
        amountVariance: null,
        relatedRecordIds: [],
        suggestedQuestions,
      });
      continue;
    }

    // Partial approval info
    if (!hasApprover || !hasApprovalDate) {
      discrepancies.push(
        `Approval evidence is partial: missing ${!hasApprover ? 'approver identity' : 'approval date'}.`
      );
      suggestedQuestions.push({
        recordId: record.id,
        question: `Who specifically granted approval and on what exact date/time for ${record.poNumber}? Please attach the source approval record showing both identity and timestamp.`,
        rationale: `Partial approval metadata was found (${record.approvalChannel || 'channel unspecified'}), but ${!hasApprover ? 'approver name' : 'approval date'} is missing.`,
        owner: 'Procurement',
        status: 'open',
        source: 'rule_engine',
      });
    }

    // Timing comparison (Approval vs Payment)
    let hasTimingIssue = false;
    if (hasApprovalDate && hasPaymentDate && record.approvalDate && record.paymentDate) {
      const delta = diffDays(record.approvalDate, record.paymentDate);
      timingDeltaDays = delta;

      if (delta !== null && delta > 0) {
        hasTimingIssue = true;
        discrepancies.push(
          `Approval date (${record.approvalDate}) is ${delta} day${delta === 1 ? '' : 's'} AFTER payment date (${record.paymentDate}).`
        );
        suggestedQuestions.push({
          recordId: record.id,
          question: `Why was ${record.poNumber} paid on ${record.paymentDate} while documented approval from ${record.approverName || 'the approver'} is dated ${record.approvalDate} (${delta} day${delta === 1 ? '' : 's'} later)? Was verbal or earlier approval obtained and documented elsewhere?`,
          rationale: `Chronological sequence shows payment preceding documented approval by ${delta} day(s).`,
          owner: 'Accounts Payable',
          status: 'open',
          source: 'rule_engine',
        });
      } else if (delta === 0) {
        // Same day: check intra-day timestamps if available
        if (record.approvalTime && record.paymentTime) {
          const appMs = parseDateMs(record.approvalDate, record.approvalTime);
          const payMs = parseDateMs(record.paymentDate, record.paymentTime);
          if (appMs !== null && payMs !== null && appMs > payMs) {
            hasTimingIssue = true;
            discrepancies.push(
              `Same-day sequence issue: approval timestamp (${record.approvalTime}) occurred after payment timestamp (${record.paymentTime}) on ${record.paymentDate}.`
            );
            suggestedQuestions.push({
              recordId: record.id,
              question: `Both approval and payment occurred on ${record.paymentDate}, with approval logged at ${record.approvalTime} after payment at ${record.paymentTime}. Can AP confirm whether an earlier offline approval existed before payment release?`,
              rationale: `Intra-day timestamps indicate payment preceded approval on ${record.paymentDate}.`,
              owner: 'Accounts Payable',
              status: 'open',
              source: 'rule_engine',
            });
          } else {
            observations.push(
              `Same-day approval (${record.approvalTime}) preceded payment timestamp (${record.paymentTime}) on ${record.paymentDate}.`
            );
          }
        } else {
          discrepancies.push(
            `Approval and payment share the same date (${record.paymentDate}) without intra-day timestamps to confirm sequence.`
          );
          suggestedQuestions.push({
            recordId: record.id,
            question: `Approval and payment for ${record.poNumber} both occurred on ${record.paymentDate}. Can system audit logs provide exact timestamps confirming approval occurred prior to payment release?`,
            rationale: `Same-day dates lack hour/minute timestamps to establish pre-payment order.`,
            owner: 'IT / System Admin',
            status: 'open',
            source: 'rule_engine',
          });
        }
      } else if (delta !== null && delta < 0) {
        observations.push(
          `Documented approval date (${record.approvalDate}) precedes payment date (${record.paymentDate}) by ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'}.`
        );
      }
    } else if (hasApprovalDate && !hasPaymentDate) {
      observations.push(
        `Approval dated ${record.approvalDate} is present; payment date is not yet recorded in the evidence.`
      );
      suggestedQuestions.push({
        recordId: record.id,
        question: `Has ${record.poNumber} been paid yet? If so, please provide the disbursement date and payment batch reference to confirm pre-payment timing.`,
        rationale: `Payment date is missing from the current evidence package.`,
        owner: 'Accounts Payable',
        status: 'open',
        source: 'rule_engine',
      });
    }

    // Approver authority & segregation of duties check
    const roleStatus = isManagerialRole(record.approverRole);
    let hasConsistencyIssue = false;

    if (
      hasApprover &&
      normalizeText(record.approverName) === normalizeText(record.requesterName)
    ) {
      hasConsistencyIssue = true;
      discrepancies.push(
        `Requester and approver share the same name (${record.requesterName}), indicating potential self-approval.`
      );
      suggestedQuestions.push({
        recordId: record.id,
        question: `The evidence lists ${record.requesterName} as both requester and approver for ${record.poNumber}. Was independent approval obtained from another manager in accordance with segregation-of-duties expectations?`,
        rationale: `Self-approval does not provide independent managerial oversight.`,
        owner: 'Department Manager',
        status: 'open',
        source: 'rule_engine',
      });
    }

    if (hasApprover && roleStatus === 'unknown') {
      hasConsistencyIssue = true;
      discrepancies.push(
        `Approver role/title for ${record.approverName} is missing or unverified.`
      );
      suggestedQuestions.push({
        recordId: record.id,
        question: `Can HR or Procurement confirm ${record.approverName}'s title and delegated approval authority as a manager as of ${record.approvalDate || record.purchaseDate}?`,
        rationale: `Approver role is unspecified, so managerial status cannot yet be verified from the evidence alone.`,
        owner: 'Procurement',
        status: 'open',
        source: 'rule_engine',
      });
    } else if (hasApprover && roleStatus === 'no') {
      hasConsistencyIssue = true;
      discrepancies.push(
        `Listed approver (${record.approverName}, "${record.approverRole}") does not appear to hold a managerial title.`
      );
      suggestedQuestions.push({
        recordId: record.id,
        question: `Does "${record.approverRole}" (${record.approverName}) carry formal managerial approval authority for purchases over ${formatCurrency(threshold)}, or was a manager-level sign-off also obtained?`,
        rationale: `Control requires approval by a manager; current role metadata shows "${record.approverRole}".`,
        owner: 'Department Manager',
        status: 'open',
        source: 'rule_engine',
      });
    } else if (hasApprover && roleStatus === 'yes') {
      observations.push(
        `Approver ${record.approverName} holds a managerial title (${record.approverRole}).`
      );
    }

    // Amount consistency check
    if (record.approvedAmount !== null && record.approvedAmount !== undefined) {
      const comparisonBase = record.paidAmount ?? record.purchaseAmount;
      const diff = Number((comparisonBase - record.approvedAmount).toFixed(2));
      amountVariance = diff;

      if (diff > 0.01) {
        hasConsistencyIssue = true;
        discrepancies.push(
          `Actual ${record.paidAmount ? 'paid' : 'purchase'} amount (${formatCurrency(comparisonBase)}) exceeds approved amount (${formatCurrency(record.approvedAmount)}) by ${formatCurrency(diff)}.`
        );
        suggestedQuestions.push({
          recordId: record.id,
          question: `The approved amount for ${record.poNumber} was ${formatCurrency(record.approvedAmount)}, whereas ${formatCurrency(comparisonBase)} was ${record.paidAmount ? 'paid' : 'invoiced'} (+${formatCurrency(diff)}). Was a supplemental managerial approval obtained for the variance?`,
          rationale: `Invoice/payment exceeded documented approved amount by ${formatCurrency(diff)}.`,
          owner: 'Department Manager',
          status: 'open',
          source: 'rule_engine',
        });
      } else if (diff < -0.01) {
        observations.push(
          `Paid/purchase amount (${formatCurrency(comparisonBase)}) is within the approved limit (${formatCurrency(record.approvedAmount)}).`
        );
      } else {
        observations.push(
          `Purchase/paid amount matches approved amount (${formatCurrency(record.approvedAmount)}).`
        );
      }
    } else {
      hasConsistencyIssue = true;
      missingFields.push('Approved Amount');
      discrepancies.push('Approved dollar amount is not explicitly stated on the approval evidence.');
      suggestedQuestions.push({
        recordId: record.id,
        question: `The approval artifact (${record.approvalChannel || 'record'}) does not specify an approved dollar cap. Can the approver confirm they reviewed and approved the full ${formatCurrency(effectiveAmount)} amount?`,
        rationale: `No explicit approved amount is recorded to verify against ${formatCurrency(effectiveAmount)}.`,
        owner: 'Department Manager',
        status: 'open',
        source: 'rule_engine',
      });
    }

    // Determine final neutral classification
    let classification: EvidenceClassification = 'evidence_observed';
    let classificationLabel = 'Complete Evidence Observed';

    if (hasTimingIssue) {
      classification = 'timing_discrepancy';
      classificationLabel = 'Timing Discrepancy';
    } else if (hasConsistencyIssue || discrepancies.length > 0 || missingFields.length > 0) {
      classification = 'inconsistent_incomplete';
      classificationLabel = 'Incomplete / Inconsistent';
    }

    assessments.set(record.id, {
      recordId: record.id,
      inScope: true,
      isBoundaryAmount,
      classification,
      classificationLabel,
      observations,
      discrepancies,
      missingFields,
      timingDeltaDays,
      amountVariance,
      relatedRecordIds,
      suggestedQuestions,
    });
  }

  return assessments;
}

export function buildInitialQuestions(
  records: PurchaseRecord[],
  assessments: Map<string, EvidenceAssessment>
): FollowUpQuestion[] {
  const result: FollowUpQuestion[] = [];
  for (const record of records) {
    const assessment = assessments.get(record.id);
    if (!assessment) continue;
    assessment.suggestedQuestions.forEach((q, idx) => {
      result.push({
        ...q,
        id: `q-${record.id}-${idx + 1}`,
        createdAt: '2026-11-21T06:00:00Z',
      });
    });
  }
  return result;
}

export const OWNER_OPTIONS: QuestionOwner[] = [
  'Accounts Payable',
  'Department Manager',
  'Procurement',
  'Requester',
  'IT / System Admin',
];
