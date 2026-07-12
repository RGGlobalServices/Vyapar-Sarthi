import { requireShop } from '@/lib/server/auth';
import { handle, json, ApiError } from '@/lib/server/http';
import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  const { shop } = await requireShop(req);
  
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  
  if (!file) {
    throw new ApiError(400, 'No file uploaded');
  }

  // Reuses the 'invoices' bucket (already provisioned and writable with the
  // anon key — see lib/supabaseStorage.ts) under a staff-docs/ prefix, since
  // a dedicated 'staff_documents' bucket was never created in Supabase.
  const BUCKET_NAME = 'invoices';

  // Generate a unique filename using crypto.randomUUID
  const fileExt = (file.name.split('.').pop() || '').toLowerCase();
  const fileName = `staff-docs/${shop.id}/${crypto.randomUUID()}.${fileExt}`;

  // Some pickers (mobile camera/gallery intents especially) report an empty
  // file.type. A missing/generic Content-Type makes browsers force-download
  // the file instead of opening it inline when a user clicks "View" — fall
  // back to a lookup by extension so images/PDFs render in the browser tab.
  const EXT_MIME: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', heic: 'image/heic', pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  const contentType = file.type || EXT_MIME[fileExt] || 'application/octet-stream';

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      upsert: true,
      contentType
    });

  if (error) {
    console.error("Supabase upload error:", error);
    throw new ApiError(500, `Upload failed: ${error.message}`);
  }

  // Assuming we might want to display it right away, we fetch public URL. 
  // If bucket is private, this URL won't work without token, but for now we return both path and url.
  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  return json({
    path: fileName,
    url: publicUrlData.publicUrl
  }, 201);
});
