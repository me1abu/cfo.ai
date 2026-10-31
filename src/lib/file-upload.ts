import {
  ACCEPTED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  type AcceptedDocumentType,
} from "./extraction";

export const ACCEPT_ATTRIBUTE = ".pdf,.png,.jpg,.jpeg,.webp,.gif";

export type ReadDocumentResult =
  | { ok: true; fileName: string; mediaType: AcceptedDocumentType; base64: string }
  | { ok: false; error: string };

/** Checks type and size in the browser, then reads the file as Base64 for the server. */
export async function readDocumentFile(file: File): Promise<ReadDocumentResult> {
  const mediaType = (ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type)
    ? (file.type as AcceptedDocumentType)
    : null;
  if (!mediaType) {
    return { ok: false, error: "Upload a PDF or an image (PNG, JPG, WebP or GIF)." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      error: `This file is ${mb} MB. The limit is ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB; try a compressed PDF or a smaller photo.`,
    };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
  return {
    ok: true,
    fileName: file.name,
    mediaType,
    base64: dataUrl.slice(dataUrl.indexOf(",") + 1),
  };
}
