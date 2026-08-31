import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, ERROR_CODES } from "@/lib/errors";

/**
 * Upload de imagens (browser). Comprime via canvas ANTES do upload:
 * foto de celular (5MB+) estouraria o limite de 2MB do bucket e o
 * free tier de 1GB do Storage. Image Transformations do Supabase é
 * plano Pro — compressão client-side é a alternativa custo zero.
 */

export const STORAGE_BUCKET = "menu-images";
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_DIMENSION_PX = 1200;
const JPEG_QUALITY = 0.82;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type ImageKind = "logo" | "item";

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height),
  );
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new AppError(ERROR_CODES.INTERNAL, "Falha ao processar imagem.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new AppError(ERROR_CODES.INTERNAL, "Falha ao comprimir imagem.")),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

export async function uploadImage(
  supabase: SupabaseClient,
  file: File,
  establishmentId: string,
  kind: ImageKind,
): Promise<string> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      "Formato inválido. Use JPG, PNG ou WebP.",
    );
  }

  const blob = await compressImage(file);
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      "Imagem grande demais mesmo após compressão (máx. 2MB).",
    );
  }

  const path = `${establishmentId}/${kind}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });

  if (error) {
    throw new AppError(ERROR_CODES.INTERNAL, "Falha no upload da imagem.", {
      originalMessage: error.message,
    });
  }

  return supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}
