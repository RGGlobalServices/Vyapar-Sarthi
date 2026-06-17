
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
