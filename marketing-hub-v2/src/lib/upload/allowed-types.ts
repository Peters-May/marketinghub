/**
 * Shared asset upload allowlist — keep API routes and file pickers in sync.
 * Still blocks SVG/HTML/executables (XSS / malware risk).
 */

/** Default per-file limit for staff uploads (requests, merch, etc.). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Admins managing media may upload larger originals (e.g. DJI stills). */
export const MAX_UPLOAD_BYTES_ADMIN = 100 * 1024 * 1024;

export function maxUploadBytesForRole(role?: string | null) {
  return role === "admin" ? MAX_UPLOAD_BYTES_ADMIN : MAX_UPLOAD_BYTES;
}

export const ALLOWED_UPLOAD_MIME = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Documents
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/csv",
  "text/rtf",
  "application/rtf",
  // Word
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Excel
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  // PowerPoint
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // OpenDocument
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  // Archives / design packages
  "application/zip",
  "application/x-zip-compressed",
  // Outlook email templates (.oft). Browsers often send one of these.
  "application/vnd.ms-outlook",
  "application/x-msoutlook",
  // Video (.m4v is MPEG-4; browsers often report video/x-m4v or video/mp4)
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
]);

/** Extension fallback when browsers send empty / octet-stream MIME. */
export const ALLOWED_UPLOAD_EXT =
  /\.(png|jpe?g|gif|webp|pdf|mp4|mov|m4v|docx?|xlsx?|xlsm|pptx?|csv|txt|rtf|odt|ods|odp|zip|oft)$/i;

/** HTML file input `accept` — MIME + extensions for broader picker support. */
export const UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,video/mp4,video/quicktime,video/x-m4v,application/vnd.ms-outlook,.jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.odt,.ods,.odp,.zip,.mp4,.mov,.m4v,.oft";

export const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".rtf": "application/rtf",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".odp": "application/vnd.oasis.opendocument.presentation",
  ".zip": "application/zip",
  ".oft": "application/vnd.ms-outlook",
};

const FORCE_DOWNLOAD_EXT = new Set([
  ".pdf",
  ".mp4",
  ".m4v",
  ".mov",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".csv",
  ".txt",
  ".rtf",
  ".odt",
  ".ods",
  ".odp",
  ".zip",
  ".oft",
]);

/**
 * Content-Type stored with the file. An .m4v is MPEG-4; label it as MP4 so
 * players and Planable treat it like the other video uploads.
 */
export function uploadContentType(name: string, type?: string): string {
  if (/\.m4v$/i.test(name)) return "video/mp4";
  if (/\.oft$/i.test(name)) return "application/vnd.ms-outlook";
  const mime = (type || "").trim();
  return mime || "application/octet-stream";
}

export function isBlockedUpload(name: string, type?: string) {
  return type === "image/svg+xml" || /\.svg$/i.test(name);
}

const DANGEROUS_EXT = /\.(html?|xhtml|svgz?|xml|js|mjs|cjs|exe|bat|cmd|ps1|hta|php)$/i;
const DANGEROUS_MIME =
  /^(text\/html|image\/svg\+xml|application\/xhtml\+xml|application\/javascript|text\/javascript)/i;

export function isAllowedUpload(name: string, type?: string) {
  if (isBlockedUpload(name, type)) return false;
  if (DANGEROUS_EXT.test(name) || DANGEROUS_MIME.test(type || "")) return false;
  const mime = (type || "").trim().toLowerCase();
  const extOk = ALLOWED_UPLOAD_EXT.test(name);
  const declaredMime = Boolean(mime) && mime !== "application/octet-stream";
  const mimeOk = declaredMime && ALLOWED_UPLOAD_MIME.has(mime);
  if (declaredMime && !mimeOk) return false;
  if (extOk && (mimeOk || !declaredMime)) return true;
  return mimeOk && !/\.[a-z0-9]+$/i.test(name);
}

export function isForcedDownloadExt(ext: string) {
  return FORCE_DOWNLOAD_EXT.has(ext.toLowerCase());
}
