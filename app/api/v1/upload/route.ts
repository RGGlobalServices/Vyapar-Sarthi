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

  const BUCKET_NAME = 'staff_documents';
  
  // Generate a unique filename using crypto.randomUUID
  const fileExt = file.name.split('.').pop();
  const fileName = `${shop.id}/${crypto.randomUUID()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      upsert: true,
      contentType: file.type
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
