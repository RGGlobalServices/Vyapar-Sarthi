
import api from './api';

/**
 * Uploads a PDF blob to Supabase Storage and returns the public URL.
 * Falls back to null if upload fails.
 */
export async function uploadInvoiceToSupabase(blob: Blob, fileName: string, contentType: string = 'application/pdf'): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials missing');
      return null;
    }

    // 1. Upload to 'invoices' bucket
    const uploadUrl = `${supabaseUrl}/storage/v1/object/invoices/${fileName}`;
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: blob
    });

    if (!response.ok) {
      const err = await response.json();
      console.warn('Supabase upload failed:', err);
      // If bucket doesn't exist, we can't do much without service key
      return null;
    }

    // 2. Get Public URL
    return `${supabaseUrl}/storage/v1/object/public/invoices/${fileName}`;
  } catch (error) {
    console.error('Error uploading invoice:', error);
    return null;
  }
}

/**
 * Uploads a manually-captured/selected bill file (JPG/PNG/PDF) to Supabase
 * Storage and returns its public URL. Reuses the 'invoices' bucket (already
 * configured for anon-key uploads) under a manual-bills/ prefix, so no new
 * bucket or policy is needed.
 */
export async function uploadManualBillFile(file: File, shopId: string): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials missing');
      return null;
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileName = `manual-bills/${shopId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const uploadUrl = `${supabaseUrl}/storage/v1/object/invoices/${fileName}`;

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: file,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn('Manual bill upload failed:', err);
      return null;
    }

    return `${supabaseUrl}/storage/v1/object/public/invoices/${fileName}`;
  } catch (error) {
    console.error('Error uploading manual bill:', error);
    return null;
  }
}
