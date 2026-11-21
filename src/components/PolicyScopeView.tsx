import React from 'react';

interface PolicyScopeViewProps {
  onLoadSample: () => void;
  onClearWorkpaper: () => void;
  recordCount: number;
}

export const PolicyScopeView: React.FC<PolicyScopeViewProps> = ({
  onLoadSample,
  onClearWorkpaper,
  recordCount,
}) => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">
          Control Rule &amp; Testing Boundary
        </h2>
        <p className="text-sm text-slate-700 leading-relaxed">
          <strong className="text-slate-900">Policy Requirement:</strong> Every purchase over $1,000 must be approved by a manager before it is paid.
        </p>
        <p className="text-sm text-slate-600 leading-relaxed">
          This assistant structures purchase, approval, and payment evidence and identifies factual gaps or inconsistencies requiring follow-up. It intentionally refrains from issuing a pass or fail conclusion on control design or operating effectiveness—final judgment rests solely with the compliance reviewer after inquiry responses are evaluated.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">
            Deterministic Evidence Checks Applied
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Every transaction in the workpaper is automatically cross-checked across these six criteria:
          </p>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <h4 className="font-semibold text-slate-900">1. Threshold Scope (&gt; $1,000.00)</h4>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Evaluates both purchase/invoice amount and paid amount against $1,000.00. Exact $1,000.00 transactions are flagged as boundary cases for policy interpretation clarity.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">2. Approval Presence</h4>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Identifies in-scope transactions lacking an approver identity, approval date, or supporting workflow/email reference.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">3. Pre-Payment Chronology</h4>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Compares approval date/time against payment settlement date/time. Flags post-payment approvals and same-day pairs missing intra-day timestamps.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">4. Managerial Authority &amp; Segregation</h4>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Checks whether the approver role reflects managerial authority and flags records where the requester and approver are the same individual.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">5. Amount Consistency</h4>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Compares approved dollar caps against invoiced and paid amounts, highlighting unapproved overages or missing approved-amount figures.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-slate-900">6. Split-Purchase Proximity</h4>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Scans transactions at or below $1,000 to the same normalized vendor within a 3-day window whose combined spend exceeds $1,000.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Workpaper Dataset Management</h3>
          <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
            Currently holding {recordCount} transaction record{recordCount === 1 ? '' : 's'} in active session.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onLoadSample}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap"
          >
            Reset to Q3 Sample
          </button>
          <button
            type="button"
            onClick={onClearWorkpaper}
            className="px-3.5 py-2 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-50 whitespace-nowrap"
          >
            Clear Workpaper
          </button>
        </div>
      </div>
    </div>
  );
};
