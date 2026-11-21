import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const MODEL_NAME = 'gemini-4-hydrogen';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please verify your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const NEUTRAL_SYSTEM_INSTRUCTION = `You are a meticulous internal audit and compliance evidence assistant.
The company control rule under review is:
"Every purchase over $1,000 must be approved by a manager before it is paid."

STRICT NEUTRALITY DIRECTIVE:
- Your role is strictly to extract, organize, and structure factual transaction, approval, and payment evidence, highlight missing/incomplete/inconsistent details, and identify neutral, constructive follow-up questions for the compliance reviewer.
- NEVER decide, state, or imply whether the control passes or fails, whether the company is compliant or non-compliant, or whether a deficiency/material weakness exists. That determination belongs exclusively to the human reviewer.
- Be precise with dates (YYYY-MM-DD), timestamps (HH:mm when present), dollar amounts, names, roles, and source document references. Leave unknown fields as null rather than guessing.`;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // 1. Parse unstructured text or uploaded document/image into structured PurchaseRecord[] + follow-up questions
  app.post('/api/evidence/parse', async (req: Request, res: Response) => {
    try {
      const { rawText, fileBase64, mimeType, fileName, threshold = 1000 } = req.body as {
        rawText?: string;
        fileBase64?: string;
        mimeType?: string;
        fileName?: string;
        threshold?: number;
      };

      if (!rawText?.trim() && !fileBase64) {
        res.status(400).json({ error: 'Provide raw text or an uploaded evidence file to parse.' });
        return;
      }

      const ai = getGeminiClient();

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (fileBase64 && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: fileBase64,
          },
        });
      }

      const promptText = `Extract all purchase transactions and any associated approval or payment evidence from the provided material${
        fileName ? ` (file: ${fileName})` : ''
      }.
Control threshold: $${threshold}.

Instructions:
1. Extract every distinct purchase/invoice/card transaction into the "records" array.
2. Normalize dates to YYYY-MM-DD and 24-hour times to HH:mm if visible; otherwise set missing dates/times/approvers to null.
3. For each transaction, list any ambiguities or extra follow-up questions that a compliance reviewer should ask (without declaring pass or fail).
4. Provide brief "extractionNotes" summarizing what source artifacts were found and any unreadable or ambiguous sections.

${rawText?.trim() ? `Raw Evidence Text:\n"""\n${rawText.trim()}\n"""` : 'Parse the attached evidence document.'}`;

      parts.push({ text: promptText });

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: { parts },
        config: {
          systemInstruction: NEUTRAL_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              extractionNotes: {
                type: Type.STRING,
                description: 'Neutral summary of extracted evidence and any ambiguous/missing source details.',
              },
              records: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    poNumber: { type: Type.STRING },
                    invoiceNumber: { type: Type.STRING, nullable: true },
                    vendor: { type: Type.STRING },
                    department: { type: Type.STRING },
                    description: { type: Type.STRING },
                    requesterName: { type: Type.STRING },
                    requesterTitle: { type: Type.STRING, nullable: true },
                    purchaseDate: { type: Type.STRING, description: 'YYYY-MM-DD' },
                    purchaseAmount: { type: Type.NUMBER },
                    approvedAmount: { type: Type.NUMBER, nullable: true },
                    paidAmount: { type: Type.NUMBER, nullable: true },
                    approvalDate: { type: Type.STRING, nullable: true, description: 'YYYY-MM-DD or null' },
                    approvalTime: { type: Type.STRING, nullable: true, description: 'HH:mm or null' },
                    approverName: { type: Type.STRING, nullable: true },
                    approverRole: { type: Type.STRING, nullable: true },
                    approvalChannel: { type: Type.STRING, nullable: true },
                    paymentDate: { type: Type.STRING, nullable: true, description: 'YYYY-MM-DD or null' },
                    paymentTime: { type: Type.STRING, nullable: true, description: 'HH:mm or null' },
                    paymentReference: { type: Type.STRING, nullable: true },
                    rawExcerpt: { type: Type.STRING },
                    aiQuestions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          question: { type: Type.STRING },
                          rationale: { type: Type.STRING },
                          owner: {
                            type: Type.STRING,
                            description: 'One of: Accounts Payable, Department Manager, Procurement, Requester, IT / System Admin',
                          },
                        },
                        required: ['question', 'rationale', 'owner'],
                      },
                    },
                  },
                  required: [
                    'poNumber',
                    'vendor',
                    'department',
                    'description',
                    'requesterName',
                    'purchaseDate',
                    'purchaseAmount',
                    'rawExcerpt',
                  ],
                },
              },
            },
            required: ['extractionNotes', 'records'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse evidence with Gemini.';
      console.error('Error in /api/evidence/parse:', err);
      res.status(500).json({ error: message });
    }
  });

  // 2. Generate tailored follow-up questions & inquiry email draft for a specific transaction
  app.post('/api/evidence/questions', async (req: Request, res: Response) => {
    try {
      const { record, assessment } = req.body;
      if (!record || !assessment) {
        res.status(400).json({ error: 'Transaction record and assessment are required.' });
        return;
      }

      const ai = getGeminiClient();

      const prompt = `Review this single purchase record and its deterministic factual observations.
Generate 2 to 4 sharp, specific, neutral follow-up questions for the compliance reviewer to investigate the gaps/inconsistencies, plus a concise, polite inquiry email draft that the reviewer can send to the relevant internal team(s).
Do NOT decide or state whether the control passes or fails.

Transaction Record:
${JSON.stringify(record, null, 2)}

Factual Assessment:
${JSON.stringify(assessment, null, 2)}`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: NEUTRAL_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                    owner: {
                      type: Type.STRING,
                      description: 'One of: Accounts Payable, Department Manager, Procurement, Requester, IT / System Admin',
                    },
                  },
                  required: ['question', 'rationale', 'owner'],
                },
              },
              inquiryDraftSubject: { type: Type.STRING },
              inquiryDraftBody: { type: Type.STRING },
            },
            required: ['questions', 'inquiryDraftSubject', 'inquiryDraftBody'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate follow-up questions.';
      console.error('Error in /api/evidence/questions:', err);
      res.status(500).json({ error: message });
    }
  });

  // 3. Prepare a neutral Workpaper Preparation Brief across all reviewed records
  app.post('/api/workpaper/summary', async (req: Request, res: Response) => {
    try {
      const { records, assessments, questions } = req.body;
      if (!Array.isArray(records)) {
        res.status(400).json({ error: 'Records array is required.' });
        return;
      }

      const ai = getGeminiClient();

      const prompt = `Organize the following purchasing control evidence dataset into a neutral Workpaper Preparation Brief for a compliance reviewer.
Control rule: Every purchase over $1,000 must be approved by a manager before it is paid.
CRITICAL: Do NOT conclude whether the control passes or fails, and do NOT rate effectiveness. Only summarize scope, factual evidence completeness, cross-transaction patterns, and grouped follow-up inquiries.

Dataset Summary:
${JSON.stringify({ records, assessments, questions }, null, 2)}`;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          systemInstruction: NEUTRAL_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scopeOverview: { type: Type.STRING },
              evidenceBreakdown: { type: Type.STRING },
              keyPatterns: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              priorityInquiries: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    owner: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    referencedIds: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['owner', 'summary', 'referencedIds'],
                },
              },
              reviewerReminder: { type: Type.STRING },
            },
            required: [
              'scopeOverview',
              'evidenceBreakdown',
              'keyPatterns',
              'priorityInquiries',
              'reviewerReminder',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        generatedAt: new Date().toISOString(),
        ...parsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to prepare workpaper brief.';
      console.error('Error in /api/workpaper/summary:', err);
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Control Testing Evidence Assistant server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
