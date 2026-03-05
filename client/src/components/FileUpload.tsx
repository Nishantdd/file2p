import type { TargetedDragEvent, TargetedEvent } from "preact";
import { useState, useRef } from "preact/hooks";

function Button({
  children,
  onClick,
  variant = "default",
  className = "",
  ...props
}: any) {
  const base =
    "px-4 py-2 font-sans font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition-colors";

  const variants: Record<string, string> = {
    default: "bg-foreground text-background hover:opacity-90",
    outline: "border border-border hover:bg-foreground/10",
    ghost: "text-muted-foreground hover:text-foreground",
  };

  return (
    <button
      onClick={onClick}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: TargetedDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: TargetedDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: TargetedDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) handleFileSelect(files[0]);
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    const mockLink = `https://papershare.app/share/${Math.random()
      .toString(36)
      .substring(2, 10)}`;
    setShareLink(mockLink);
  };

  const handleFileInputChange = (e: TargetedEvent<HTMLInputElement, Event>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) handleFileSelect(files[0]);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setShareLink("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="w-full flex items-center justify-center p-16">
      {!selectedFile ? (
        <div
          onClick={() => fileInputRef?.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`w-full group cursor-pointer relative border-2 border-dashed rounded-lg p-12 transition-all duration-200 ${
            isDragging
              ? "border-accent bg-foreground/5"
              : "hover:bg-foreground/5 hover:border-accent"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInputChange}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-6 text-center">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              class={`group-hover:text-accent transition-all duration-200 ${isDragging ? "text-accent" : "text-border"}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 2a10 10 0 0 1 7.38 16.75M12 8v8m4-4H8M2.5 8.875a10 10 0 0 0-.5 3M2.83 16a10 10 0 0 0 2.43 3.4M4.636 5.235a10 10 0 0 1 .891-.857M8.644 21.42a10 10 0 0 0 7.631-.38"
              />
            </svg>
            <div className="font-sans">
              <h3 className="text-base text-foreground font-medium">
                Drop your file here
              </h3>
              <p className="text-sm">or click to browse</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full border border-border rounded-lg p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0">
              {/* File Icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
                <path d="M4 16v4h16v-4" />
              </svg>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-xl mb-1">{selectedFile.name}</h3>
              <p className="text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              {/* Link Icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10 5" />
                <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L14 19" />
              </svg>
              <span style={{ fontFamily: "'Inter', sans-serif" }}>
                Share Link
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1 px-4 py-2 bg-input-background border border-border rounded-lg focus:outline-none"
              />

              <Button onClick={handleCopy} variant="outline">
                {copied ? (
                  <>
                    {/* Check */}
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Copied
                  </>
                ) : (
                  <>
                    {/* Copy */}
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-dotted border-border">
            <Button onClick={handleReset} variant="ghost">
              Share Another File
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
