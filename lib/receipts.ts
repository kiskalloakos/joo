import { supabase, userId } from './supabase';

const BUCKET = 'transaction-receipts';
const MAX_BYTES = 10 * 1024 * 1024;

/** Upload bytes, never a temporary picker URI or a public image URL. */
export async function uploadReceipt(uri: string, transactionId: string, mimeType: string): Promise<string> {
  const uid = await userId();
  if (!uid) throw new Error('Sign in again before saving the attachment.');
  const base64 = uri.match(/^data:image\/jpeg;base64,(.+)$/)?.[1];
  if (!base64) throw new Error('Please attach the image again.');
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
  if (bytes.byteLength > MAX_BYTES) throw new Error('Choose an image smaller than 10 MB.');
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${uid}/${transactionId}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimeType, upsert: true,
  });
  if (error) throw new Error(`Could not save attachment: ${error.message}`);
  return path;
}

export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) throw new Error('Could not load attachment. Please try again.');
  return data.signedUrl;
}
