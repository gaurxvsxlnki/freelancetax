/**
 * process-receipt — server-side receipt OCR + structured extraction.
 *
 * Deploy with:
 *   supabase functions deploy process-receipt
 *
 * Env vars (set in the Supabase dashboard; never exposed to the browser):
 *   SUPABASE_URL            (injected automatically)
 *   SUPABASE_SERVICE_ROLE_KEY (injected automatically)
 *   OPENAI_API_KEY          (optional — enables vision-based extraction)
 *
 * Behavior:
 *   - The caller's access token is verified with getUser() so a user can
 *     only trigger processing for their own receipts.
 *   - The receipt file is downloaded from the private storage bucket.
 *   - If OPENAI_API_KEY is set and the file is an image, the vision model
 *     extracts merchant / amount / date / text and the row is updated to
 *     "completed".
 *   - If no provider is configured (or the file is a PDF, which needs a
 *     PDF-specific extractor), the row is honestly marked "needs_review"
 *     with a plain-language note. Nothing is fabricated.
 *
 * The response mirrors what the client expects:
 *   { configured, status, merchant?, amount?, date?, text?, error? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

interface ReceiptRow {
  id: string;
  user_id: string;
  file_path: string | null;
  file_name: string;
  file_type: string;
}

interface ExtractionResult {
  merchant: string;
  amount: number | null;
  date: string | null;
  text: string | null;
}

const NO_PROVIDER_NOTE =
  'Automatic receipt scanning isn\u2019t configured for this project yet, so no details were extracted. Review the file and enter the details manually.';

const PDF_NOTE =
  'This receipt is a PDF. PDF text extraction is not enabled yet — review the file and enter the details manually.';

/** Restrict CORS to the configured app origin when APP_URL is set. */
function corsHeaders(): Record<string, string> {
  const appUrl = Deno.env.get('APP_URL') ?? '';
  return {
    'Access-Control-Allow-Origin': appUrl || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(appUrl ? { Vary: 'Origin' } : {}),
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

/** Hard ceiling on what we will base64 + send to a vision model (10 MB). */
const MAX_PROCESS_BYTES = 10 * 1024 * 1024;

function isImage(fileType: string, fileName: string): boolean {
  return fileType.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(fileName);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Pull a JSON object out of a model reply that may include markdown fences. */
function parseExtraction(raw: string): Partial<ExtractionResult> {
  const cleaned = raw
    .replace(/```(?:json)?/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Partial<ExtractionResult>;
  } catch {
    return {};
  }
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function toDateOrNull(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  const m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) {
      const mm = `${date.getMonth() + 1}`.padStart(2, '0');
      const dd = `${date.getDate()}`.padStart(2, '0');
      return `${date.getFullYear()}-${mm}-${dd}`;
    }
  }
  return null;
}

async function extractWithOpenAI(
  openaiKey: string,
  base64: string,
  mimeType: string
): Promise<ExtractionResult | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content:
            'You extract structured data from receipt images for a bookkeeping app. ' +
            'Respond with JSON only, no markdown, in this exact shape: ' +
            '{"merchant": string, "amount": number|null, "date": "YYYY-MM-DD"|null, "text": string}. ' +
            'If a field is not visible, use null (merchant may fall back to the best guess or ""). ' +
            'text should contain all visible text, or null if the image has none.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract the receipt information from this image.',
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed with status ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = data.choices?.[0]?.message?.content ?? '';
  if (!raw) return null;

  const parsed = parseExtraction(raw);
  return {
    merchant: typeof parsed.merchant === 'string' ? parsed.merchant.trim() : '',
    amount: toNumOrNull(parsed.amount),
    date: toDateOrNull(parsed.date),
    text: typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text.trim() : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return preflight();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Server misconfigured: missing Supabase credentials.' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // --- Verify the caller ----------------------------------------------------
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'You need to be signed in to do that.' }, 401);

    const {
      data: { user },
      error: authError,
    } = await admin.auth.getUser(token);
    if (authError || !user) {
      return json({ error: 'Your session is no longer valid. Sign in again and retry.' }, 401);
    }

    // --- Locate the receipt ---------------------------------------------------
    let receiptId = '';
    try {
      const body = (await req.json()) as { receiptId?: string };
      receiptId = String(body?.receiptId ?? '');
    } catch {
      receiptId = '';
    }
    if (!receiptId) return json({ error: 'Missing receipt id.' }, 400);

    const { data: receipt, error: fetchError } = await admin
      .from('receipts')
      .select('id, user_id, file_path, file_name, file_type')
      .eq('id', receiptId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError || !receipt) {
      return json({ error: 'Receipt not found.' }, 404);
    }
    const r = receipt as ReceiptRow;

    // --- No provider configured: honest "needs review" --------------------------
    if (!openaiKey) {
      await admin
        .from('receipts')
        .update({ processing_status: 'needs_review', review_note: NO_PROVIDER_NOTE })
        .eq('id', receiptId);
      return json({ configured: false, status: 'needs_review', error: NO_PROVIDER_NOTE });
    }

    // --- Download the file ------------------------------------------------------
    if (!r.file_path) {
      await admin
        .from('receipts')
        .update({ processing_status: 'needs_review', review_note: NO_PROVIDER_NOTE })
        .eq('id', receiptId);
      return json({ configured: false, status: 'needs_review', error: NO_PROVIDER_NOTE });
    }

    const { data: fileBlob, error: dlError } = await admin.storage
      .from('receipts')
      .download(r.file_path);
    if (dlError || !fileBlob) {
      const note = 'We couldn\u2019t read the uploaded file. Try uploading the receipt again.';
      await admin
        .from('receipts')
        .update({ processing_status: 'failed', review_note: note })
        .eq('id', receiptId);
      return json({ configured: true, status: 'failed', error: note });
    }

    // --- PDFs: no extractor yet, be honest -------------------------------------
    if (!isImage(r.file_type, r.file_name)) {
      await admin
        .from('receipts')
        .update({ processing_status: 'needs_review', review_note: PDF_NOTE })
        .eq('id', receiptId);
      return json({ configured: false, status: 'needs_review', error: PDF_NOTE });
    }

    // --- Refuse oversized files rather than exhausting function memory ---------
    if (fileBlob.size > MAX_PROCESS_BYTES) {
      const note =
        'This file is too large to scan automatically. Review it and enter the details manually.';
      await admin
        .from('receipts')
        .update({ processing_status: 'needs_review', review_note: note })
        .eq('id', receiptId);
      return json({ configured: true, status: 'needs_review', error: note });
    }

    // --- Run the vision model -----------------------------------------------------
    let extracted: ExtractionResult;
    try {
      const base64 = await blobToBase64(fileBlob);
      const mimeType = r.file_type.startsWith('image/') ? r.file_type : 'image/jpeg';
      const result = await extractWithOpenAI(openaiKey, base64, mimeType);
      if (!result) throw new Error('The model returned an empty response.');
      extracted = result;
    } catch (err) {
      const note = 'The receipt scanner is not responding right now. You can review and enter the details manually.';
      await admin
        .from('receipts')
        .update({ processing_status: 'needs_review', review_note: note })
        .eq('id', receiptId);
      console.error('process-receipt extraction failed', err);
      return json({ configured: true, status: 'needs_review', error: note });
    }

    const amount = extracted.amount;
    const date = extracted.date;

    // Only claim "completed" when we actually recovered something usable.
    // An empty extraction is reported honestly as needing review.
    const gotSomething = Boolean(extracted.merchant) || amount !== null || Boolean(date);
    const status = gotSomething ? 'completed' : 'needs_review';
    const note = gotSomething
      ? null
      : 'We scanned this receipt but couldn\u2019t read any details from it. Enter them manually.';

    await admin
      .from('receipts')
      .update({
        processing_status: status,
        merchant: extracted.merchant,
        amount,
        receipt_date: date,
        extracted_text: extracted.text,
        review_note: note,
      })
      .eq('id', receiptId);

    return json({
      configured: true,
      status,
      merchant: extracted.merchant,
      amount,
      date,
      text: extracted.text,
      ...(note ? { error: note } : {}),
    });
  } catch (err) {
    console.error('process-receipt failed', err);
    return json({ error: 'Receipt processing failed. Please try again.' }, 500);
  }
});