export type EvidenceClassification =
  | 'evidence_observed'
  | 'missing_approval'
  | 'timing_discrepancy'
  | 'inconsistent_incomplete'
  | 'potential_split'
  | 'threshold_exempt';

export type QuestionOwner =
  | 'Accounts Payable'
  | 'Department Manager'
  | 'Procurement'
  | 'Requester'
  | 'IT / System Admin';

export type QuestionStatus = 'open' | 'sent' | 'responded' | 'cleared';

export interface FollowUpQuestion {
  id: string;
  recordId: string;
  question: string;
  rationale: string;
  owner: QuestionOwner;
  status: QuestionStatus;
  reviewerNote?: string;
  source: 'rule_engine' | 'ai_assistant' | 'reviewer';
  createdAt: string;
}

export interface PurchaseRecord {
  id: string;
  poNumber: string;
  invoiceNumber?: string;
  vendor: string;
  department: string;
  description: string;
  requesterName: string;
  requesterTitle?: string;
  purchaseDate: string; // YYYY-MM-DD
  purchaseAmount: number;
  approvedAmount?: number | null;
  paidAmount?: number | null;
  approvalDate?: string | null; // YYYY-MM-DD
  approvalTime?: string | null; // HH:mm optional
  approverName?: string | null;
  approverRole?: string | null;
  approvalChannel?: string | null; // e.g., "ERP Workflow", "Email", "Slack", "Missing"
  paymentDate?: string | null; // YYYY-MM-DD
  paymentTime?: string | null; // HH:mm optional
  paymentReference?: string | null;
  evidenceSource: string; // Where this record came from (e.g., "AP Ledger Export", "Email PDF", "AI Parsed")
  rawExcerpt?: string;
}

export interface EvidenceAssessment {
  recordId: string;
  inScope: boolean;
  isBoundaryAmount: boolean; // exactly $1,000.00
  classification: EvidenceClassification;
  classificationLabel: string;
  observations: string[];
  discrepancies: string[];
  missingFields: string[];
  timingDeltaDays: number | null; // positive => approved AFTER payment; negative => approved BEFORE payment; 0 => same day
  amountVariance: number | null; // paidOrPurchase - approved
  relatedRecordIds: string[]; // for potential split purchases
  suggestedQuestions: Omit<FollowUpQuestion, 'id' | 'createdAt'>[];
}

export interface WorkpaperBrief {
  generatedAt: string;
  scopeOverview: string;
  evidenceBreakdown: string;
  keyPatterns: string[];
  priorityInquiries: {
    owner: string;
    summary: string;
    referencedIds: string[];
  }[];
  reviewerReminder: string;
}
