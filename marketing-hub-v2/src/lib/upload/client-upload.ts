/**
 * Upload a file without sending bytes through Next.js Route Handlers
 * (those hit a ~1MB body limit and return 413).
 *
 * Flow: ask the API for a signed Supabase URL → PUT the file directly.
 */

import {
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES_ADMIN,
} from "@/lib/upload/allowed-types";

export type UploadedAsset = {
  url: string;
  name: string;
  storage: "supabase";
};

export type UploadProgress = {
  loaded: number;
  total: number;
  /** 0–100 for this file. Stays at 99 until storage confirms the upload. */
  percent: number;
};

export type UploadAssetOptions = {
  /** Pass admin max when uploading from admin media manage UI. */
  maxBytes?: number;
  onProgress?: (progress: UploadProgress) => void;
};

async function readErrorMessage(res: Response, fallback: string, maxBytes: number) {
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { error?: string };
    if (json.error) return json.error;
  } catch {
    // ignore
  }
  if (/request entity too large/i.test(text) || res.status === 413) {
    return `File too large for upload (max ${Math.round(maxBytes / (1024 * 1024))}MB).`;
  }
  return text.trim().slice(0, 180) || fallback;
}

function reportProgress(
  onProgress: ((progress: UploadProgress) => void) | undefined,
  loaded: number,
  total: number,
  force: boolean,
  lastEmit: { at: number }
) {
  if (!onProgress) return;
  const now = Date.now();
  if (!force && now - lastEmit.at < 150) return;
  lastEmit.at = now;
  const safeTotal = total > 0 ? total : 0;
  const raw =
    safeTotal > 0 ? Math.round((Math.min(loaded, safeTotal) / safeTotal) * 100) : 0;
  onProgress({
    loaded,
    total: safeTotal,
    percent: Math.min(force ? 100 : 99, Math.max(0, raw)),
  });
}

/** PUT with upload progress. Fetch cannot report bytes sent. */
function putFileWithProgress(
  url: string,
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  if (typeof XMLHttpRequest === "undefined") {
    return fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    }).then(async (putRes) => {
      if (putRes.ok) {
        onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
        return;
      }
      const detail = await putRes.text().catch(() => "");
      throw new Error(
        `Storage upload failed for ${file.name}${detail ? `: ${detail.slice(0, 120)}` : ""}`
      );
    });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const lastEmit = { at: 0 };
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size;
      reportProgress(onProgress, event.loaded, total, false, lastEmit);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        reportProgress(onProgress, file.size, file.size, true, lastEmit);
        resolve();
        return;
      }
      const detail = (xhr.responseText || "").slice(0, 120);
      reject(
        new Error(
          `Storage upload failed for ${file.name}${detail ? `: ${detail}` : ""}`
        )
      );
    };
    xhr.onerror = () => {
      reject(new Error(`Storage upload failed for ${file.name}`));
    };
    xhr.onabort = () => {
      reject(new Error(`Upload cancelled for ${file.name}`));
    };
    xhr.send(file);
  });
}

export async function uploadAssetDirect(
  file: File,
  opts?: UploadAssetOptions
): Promise<UploadedAsset> {
  const maxBytes = Math.min(
    opts?.maxBytes ?? MAX_UPLOAD_BYTES,
    MAX_UPLOAD_BYTES_ADMIN
  );
  if (file.size <= 0) throw new Error("Empty file");
  if (file.size > maxBytes) {
    throw new Error(
      `File too large (max ${Math.round(maxBytes / (1024 * 1024))}MB): ${file.name}`
    );
  }

  const intentRes = await fetch("/api/content/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
    }),
  });

  if (!intentRes.ok) {
    throw new Error(
      await readErrorMessage(
        intentRes,
        `Could not start upload for ${file.name}`,
        maxBytes
      )
    );
  }

  const intent = (await intentRes.json()) as {
    signedUrl?: string;
    publicUrl?: string;
    name?: string;
    error?: string;
  };

  if (!intent.signedUrl || !intent.publicUrl) {
    throw new Error(intent.error || `Could not start upload for ${file.name}`);
  }

  await putFileWithProgress(intent.signedUrl, file, opts?.onProgress);

  return {
    url: intent.publicUrl,
    name: intent.name || file.name,
    storage: "supabase",
  };
}
