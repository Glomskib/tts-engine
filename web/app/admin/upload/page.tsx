"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Upload,
  FileVideo,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  brand: string;
}

type UploadState = "idle" | "uploading" | "success" | "error";

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ACCEPTED_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const ACCEPTED_EXTENSIONS = ".mp4,.mov,.webm";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export default function UploadVideoPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
      </div>
    }>
      <UploadVideoPage />
    </Suspense>
  );
}

function UploadVideoPage() {
  const searchParams = useSearchParams();
  const editVideoId = searchParams.get("video_id");
  const isEditMode = Boolean(editVideoId);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [productId, setProductId] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Fetch products
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/products");
        const json = await res.json();
        if (res.ok && json.ok) {
          setProducts(json.data || []);
        }
      } catch {
        // silently fail — product dropdown will just be empty
      } finally {
        setProductsLoading(false);
      }
    };
    load();
  }, []);

  const validateFile = (f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type)) {
      return "Unsupported file type. Please upload MP4, MOV, or WebM.";
    }
    if (f.size > MAX_FILE_SIZE) {
      return `File is too large (${formatFileSize(f.size)}). Maximum size is 500 MB.`;
    }
    return null;
  };

  const handleFileSelect = (f: File) => {
    const err = validateFile(f);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg("");
    setFile(f);
    if (!title) {
      setTitle(titleFromFilename(f.name));
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) handleFileSelect(dropped);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setUploadState("uploading");
    setProgress(0);
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);
    if (title.trim()) formData.append("title", title.trim());
    if (productId) formData.append("product_id", productId);
    formData.append("type", isEditMode ? "edited" : "raw");
    if (editVideoId) formData.append("video_id", editVideoId);

    try {
      const xhr = new XMLHttpRequest();

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            let msg = "Upload failed";
            try {
              const body = JSON.parse(xhr.responseText);
              msg = body.error || body.message || msg;
            } catch {
              // use default
            }
            reject(new Error(msg));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

        xhr.open("POST", "/api/videos/upload");
        xhr.send(formData);
      });

      setUploadState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setUploadState("error");
    }
  };

  const resetForm = () => {
    setFile(null);
    setTitle("");
    setProductId("");
    setUploadState("idle");
    setProgress(0);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Success Screen ──
  if (uploadState === "success") {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">
            {isEditMode ? "Edited Version Uploaded!" : "Video Uploaded!"}
          </h1>
          <p className="text-zinc-400 text-sm mb-6">
            Your video has been added to the pipeline for processing.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm"
            >
              Upload Another
            </button>
            <Link
              href="/admin/pipeline"
              className="px-4 py-2 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-100 transition-colors text-sm"
            >
              View Pipeline
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800">
            <Upload className="w-5 h-5 text-zinc-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {isEditMode ? "Upload Edited Version" : "Upload Video"}
            </h1>
            <p className="text-sm text-zinc-500">
              {isEditMode
                ? "Upload the edited version of this video"
                : "Drag and drop or browse for video files"}
            </p>
          </div>
        </div>

        {/* Product Dropdown */}
        {!isEditMode && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Product
            </label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              disabled={productsLoading}
              className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
            >
              <option value="">No product linked</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.brand})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Title */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Auto-generated from filename if empty"
            className="w-full px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
          />
        </div>

        {/* Drop Zone */}
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
            isDragging
              ? "border-blue-500 bg-blue-500/10"
              : file
                ? "border-zinc-700 bg-zinc-900"
                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900"
          } ${uploadState === "uploading" ? "pointer-events-none" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
            }}
          />

          {file ? (
            <div className="p-8">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-zinc-800">
                  <FileVideo className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                {uploadState === "idle" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              {uploadState === "uploading" && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                    <span>Uploading...</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center">
              <Upload className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400 mb-1">
                Drag and drop your video here, or{" "}
                <span className="text-blue-400">browse</span>
              </p>
              <p className="text-xs text-zinc-600">
                MP4, MOV, or WebM up to 500 MB
              </p>
            </div>
          )}
        </div>

        {/* Error */}
        {errorMsg && (
          <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400">{errorMsg}</p>
          </div>
        )}

        {/* File size warning */}
        {file && file.size > MAX_FILE_SIZE && (
          <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-400">
              This file exceeds the 500 MB limit and cannot be uploaded.
            </p>
          </div>
        )}

        {/* Upload Button */}
        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || uploadState === "uploading" || (file && file.size > MAX_FILE_SIZE)}
          className="w-full mt-6 py-4 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {uploadState === "uploading" ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Uploading... {progress}%
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              {isEditMode ? "Upload Edited Version" : "Upload Video"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
