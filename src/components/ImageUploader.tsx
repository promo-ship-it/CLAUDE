"use client";

import { useRef, useState } from "react";

// Uploads directly into the sibling <textarea id="images-textarea">
// rather than owning form state itself, so PropertyForm can stay a plain
// server-rendered form using a server action.
export default function ImageUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState<string[]>([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Upload failed");
          continue;
        }
        const textarea = document.getElementById("images-textarea") as HTMLTextAreaElement | null;
        if (textarea) {
          textarea.value = textarea.value ? `${textarea.value}\n${data.url}` : data.url;
        }
        setJustUploaded((prev) => [...prev, data.url]);
      } catch {
        setError("Upload failed — check your connection and try again.");
      }
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="mt-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="text-sm"
        disabled={uploading}
      />
      {uploading && <p className="text-xs text-ink/50 mt-1">Uploading…</p>}
      {error && <p className="text-xs text-brick mt-1">{error}</p>}
      {justUploaded.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {justUploaded.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="Uploaded" className="w-16 h-16 object-cover rounded-card border border-line" />
          ))}
        </div>
      )}
      <p className="text-xs text-ink/40 mt-1">
        Uploaded photos are added to the list below automatically — reorder or remove lines there;
        the first line is the cover photo.
      </p>
    </div>
  );
}
