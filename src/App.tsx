import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  FilePlus2,
  ListChecks,
  Menu,
  MessageSquareMore,
  Table2,
  X,
} from 'lucide-react';
import { EvidenceMatrix } from './components/EvidenceMatrix';
import { FollowUpQueueView } from './components/FollowUpQueueView';
import { IntakeParseView } from './components/IntakeParseView';
import { PolicyScopeView } from './components/PolicyScopeView';
import { TransactionDrawer } from './components/TransactionDrawer';
import { SAMPLE_WORKPAPER_RECORDS } from './data/sampleWorkpaper';
import { assessRecords, buildInitialQuestions } from './lib/controlEngine';
import { exportWorkpaperCsv, exportWorkpaperMarkdown } from './lib/csvUtils';
import { FollowUpQuestion, PurchaseRecord } from './types/evidence';

type ActiveTab = 'matrix' | 'intake' | 'followup' | 'policy';

const STORAGE_KEY_RECORDS = 'ctea_records_v1';
const STORAGE_KEY_QUESTIONS = 'ctea_questions_v1';

function loadInitialRecords(): PurchaseRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECORDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Fallback to sample dataset
  }
  return SAMPLE_WORKPAPER_RECORDS;
}

function loadInitialQuestions(records: PurchaseRecord[]): FollowUpQuestion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_QUESTIONS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Fallback to generated rule-engine questions
  }
  const initialAssessments = assessRecords(records);
  return buildInitialQuestions(records, initialAssessments);
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function App() {
  const [records, setRecords] = useState<PurchaseRecord[]>(() => loadInitialRecords());
  const [questions, setQuestions] = useState<FollowUpQuestion[]>(() =>
    loadInitialQuestions(loadInitialRecords())
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('matrix');
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
    } catch {
      // Ignore storage quota errors
    }
  }, [records]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_QUESTIONS, JSON.stringify(questions));
    } catch {
      // Ignore storage quota errors
    }
  }, [questions]);

  const assessments = useMemo(() => assessRecords(records), [records]);

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) ?? null,
    [records, selectedRecordId]
  );

  const selectedAssessment = selectedRecord
    ? assessments.get(selectedRecord.id) ?? null
    : null;

  const openQuestionsCount = useMemo(
    () => questions.filter((q) => q.status === 'open' || q.status === 'sent').length,
    [questions]
  );

  const handleImportRecords = (
    newRecords: PurchaseRecord[],
    extraQuestions: Omit<FollowUpQuestion, 'id' | 'createdAt'>[] = []
  ) => {
    const combined = [...newRecords, ...records];
    const nextAssessments = assessRecords(combined);
    const now = new Date().toISOString();

    const generatedForNew: FollowUpQuestion[] = [];
    newRecords.forEach((rec) => {
      const a = nextAssessments.get(rec.id);
      if (!a) return;
      a.suggestedQuestions.forEach((q, idx) => {
        generatedForNew.push({
          ...q,
          id: `q-${rec.id}-rule-${idx}-${Date.now()}`,
          createdAt: now,
        });
      });
    });

    const formattedExtra: FollowUpQuestion[] = extraQuestions.map((q, idx) => ({
      ...q,
      id: `q-${q.recordId}-ai-${idx}-${Date.now()}`,
      createdAt: now,
    }));

    setRecords(combined);
    setQuestions((prev) => [...generatedForNew, ...formattedExtra, ...prev]);
  };

  const handleUpdateRecord = (updated: PurchaseRecord) => {
    const nextRecords = records.map((r) => (r.id === updated.id ? updated : r));
    const nextAssessments = assessRecords(nextRecords);
    const updatedAssessment = nextAssessments.get(updated.id);
    const now = new Date().toISOString();

    setRecords(nextRecords);
    if (updatedAssessment) {
      setQuestions((prev) => {
        // Keep reviewer/AI questions & any rule questions that already have status !== 'open' or notes; refresh open rule questions
        const preserved = prev.filter(
          (q) =>
            q.recordId !== updated.id ||
            q.source !== 'rule_engine' ||
            q.status !== 'open' ||
            Boolean(q.reviewerNote?.trim())
        );
        const existingTexts = new Set(
          preserved.filter((q) => q.recordId === updated.id).map((q) => q.question)
        );
        const refreshedRuleQs: FollowUpQuestion[] = updatedAssessment.suggestedQuestions
          .filter((sq) => !existingTexts.has(sq.question))
          .map((sq, idx) => ({
            ...sq,
            id: `q-${updated.id}-recheck-${Date.now()}-${idx}`,
            createdAt: now,
          }));
        return [...preserved, ...refreshedRuleQs];
      });
    }
  };

  const handleDeleteRecord = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    setQuestions((prev) => prev.filter((q) => q.recordId !== id));
    if (selectedRecordId === id) {
      setSelectedRecordId(null);
    }
  };

  const handleAddQuestion = (q: Omit<FollowUpQuestion, 'id' | 'createdAt'>) => {
    const newItem: FollowUpQuestion = {
      ...q,
      id: `q-${q.recordId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setQuestions((prev) => [newItem, ...prev]);
  };

  const handleUpdateQuestion = (id: string, patch: Partial<FollowUpQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const handleDeleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleLoadSample = () => {
    const sampleAssessments = assessRecords(SAMPLE_WORKPAPER_RECORDS);
    const sampleQs = buildInitialQuestions(SAMPLE_WORKPAPER_RECORDS, sampleAssessments);
    setRecords(SAMPLE_WORKPAPER_RECORDS);
    setQuestions(sampleQs);
    setSelectedRecordId(null);
    setActiveTab('matrix');
  };

  const handleClearWorkpaper = () => {
    setRecords([]);
    setQuestions([]);
    setSelectedRecordId(null);
    setActiveTab('matrix');
  };

  const navItems: {
    key: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { key: 'matrix', label: 'Evidence Matrix', icon: Table2, badge: records.length },
    { key: 'intake', label: 'Intake & Parse', icon: FilePlus2 },
    {
      key: 'followup',
      label: 'Follow-Up Queue',
      icon: MessageSquareMore,
      badge: openQuestionsCount,
    },
    { key: 'policy', label: 'Policy & Scope', icon: BookOpen },
  ];

  const activeTabLabel =
    navItems.find((item) => item.key === activeTab)?.label ?? 'Evidence Matrix';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar (256px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-150 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between">
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Control Evidence
          </span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
            className="p-1 text-slate-500 hover:text-slate-900 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setActiveTab(item.key);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active ? 'text-slate-300' : 'text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-800">
            <ListChecks className="w-4 h-4 text-slate-500 shrink-0" />
            <span>Reviewer Neutrality</span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Evidence is organized against the &gt;$1,000 pre-payment approval policy. Control pass/fail determinations are not generated automatically.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar (Contextual Breadcrumbs + Primary Actions) */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
              className="p-1.5 text-slate-600 hover:text-slate-900 rounded-md lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0 truncate">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                Workpapers
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <span className="text-slate-500 hidden md:inline whitespace-nowrap">
                Purchasing (&gt;$1,000)
              </span>
              <span className="text-slate-300 hidden md:inline">/</span>
              <h1 className="font-semibold text-slate-900 truncate whitespace-nowrap">
                {activeTabLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen((prev) => !prev)}
                disabled={records.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Workpaper</span>
              </button>
              {exportMenuOpen && (
                <div
                  className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-md shadow-sm py-1 z-30"
                  onMouseLeave={() => setExportMenuOpen(false)}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const csv = exportWorkpaperCsv(records, assessments, questions);
                      downloadTextFile('control-evidence-workpaper.csv', csv, 'text/csv;charset=utf-8;');
                      setExportMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Download CSV Ledger
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const md = exportWorkpaperMarkdown(records, assessments, questions);
                      downloadTextFile(
                        'control-evidence-workpaper.md',
                        md,
                        'text/markdown;charset=utf-8;'
                      );
                      setExportMenuOpen(false);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    Download Markdown Memo
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('intake')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              <span>Add Evidence</span>
            </button>
          </div>
        </header>

        {/* Viewport Body */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'matrix' && (
            <EvidenceMatrix
              records={records}
              assessments={assessments}
              questions={questions}
              selectedRecordId={selectedRecordId}
              onSelectRecord={(id) => setSelectedRecordId(id)}
              onNavigateToIntake={() => setActiveTab('intake')}
              onLoadSample={handleLoadSample}
            />
          )}

          {activeTab === 'intake' && (
            <IntakeParseView
              onImportRecords={handleImportRecords}
              onNavigateToMatrix={() => setActiveTab('matrix')}
            />
          )}

          {activeTab === 'followup' && (
            <FollowUpQueueView
              records={records}
              assessments={assessments}
              questions={questions}
              onUpdateQuestion={handleUpdateQuestion}
              onSelectRecord={(id) => setSelectedRecordId(id)}
            />
          )}

          {activeTab === 'policy' && (
            <PolicyScopeView
              onLoadSample={handleLoadSample}
              onClearWorkpaper={handleClearWorkpaper}
              recordCount={records.length}
            />
          )}
        </main>
      </div>

      {/* Transaction Evidence Inspector Drawer */}
      {selectedRecord && selectedAssessment && (
        <TransactionDrawer
          record={selectedRecord}
          assessment={selectedAssessment}
          questions={questions.filter((q) => q.recordId === selectedRecord.id)}
          allRecords={records}
          onClose={() => setSelectedRecordId(null)}
          onUpdateRecord={handleUpdateRecord}
          onDeleteRecord={handleDeleteRecord}
          onAddQuestion={handleAddQuestion}
          onUpdateQuestion={handleUpdateQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          onSelectRelated={(id) => setSelectedRecordId(id)}
        />
      )}
    </div>
  );
}
