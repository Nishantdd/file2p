import type { TargetedDragEvent, TargetedEvent } from "preact";
import { useState, useRef, useEffect } from "preact/hooks";
import { generateQR } from "../utils/qr";

export function FileUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [shareQR, setShareQR] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [transferId, setTransferId] = useState("");
  const [copied, setCopied] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    peerRef.current = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    return () => {
      peerRef.current?.close();
      peerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedFile || !transferId || !peer) return;
    const wsUrl = new URL("ws://localhost:8000");
    wsUrl.searchParams.set("role", "host");
    wsUrl.searchParams.set("transferId", transferId);
    wsUrl.searchParams.set("filename", selectedFile.name);
    wsUrl.searchParams.set("filesize", selectedFile.size.toString());
    const socket = new WebSocket(wsUrl);

    let heartbeatInterval: NodeJS.Timeout | undefined;
    socket.addEventListener("open", () => {
      heartbeatInterval = setInterval(() => {
        socket.send(
          JSON.stringify({
            type: "event:heartbeat",
          }),
        );
      }, 10000);
    });

    socket.addEventListener("message", async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "incoming:offer") {
        peer.setRemoteDescription(new RTCSessionDescription(msg.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.send(
          JSON.stringify({
            type: "make:answer",
            answer: peer.localDescription,
          }),
        );
      } else if (msg.type === "transfer:candidate") {
        await peer.addIceCandidate(msg.candidate);
      }
    });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(
          JSON.stringify({
            type: "transfer:candidate",
            candidate: event.candidate,
          }),
        );
      }
    };

    peer.ondatachannel = (event) => {
      const channel = event.channel;
      channel.onopen = () => {
        console.log("data channel open");
      };
      channel.onmessage = (msg) => {
        console.log(msg.data);
      };
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        console.log("Peers connected");
      }
    };

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      socket.close();
      peer.close();
    };
  }, [selectedFile, transferId, peer]);

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

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    const transferId = Math.random().toString(36).substring(2, 10);
    const link = new URL(
      `/receive?transferId=${encodeURIComponent(transferId)}`,
      "http://localhost:4321",
    ).toString();
    const qrSvg = await generateQR(link);
    setTransferId(transferId);
    setShareQR(qrSvg);
    setShareLink(link);
  };

  const handleFileInputChange = (e: TargetedEvent<HTMLInputElement, Event>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) handleFileSelect(files[0]);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 500);
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
        <>
          <div className="w-full border rounded-lg p-4 grid grid-cols-[1fr_1px_auto] gap-4 items-stretch">
            <div className="flex flex-col justify-between gap-4 min-w-0">
              <div className="flex flex-col min-w-0">
                <h3 className="text-xl truncate">{selectedFile.name}</h3>
                <p>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <div className="grid grid-cols-[1fr_auto] w-full min-w-0">
                <input
                  type="text"
                  value={shareLink}
                  readOnly
                  className="w-full p-2 font-sans bg-dark-background border border-r-0 rounded-l-lg focus:outline-none"
                />
                <button
                  onClick={handleCopy}
                  className="flex cursor-pointer hover:bg-dark-background transition-color duration-200 items-center justify-center px-3 border rounded-r-lg hover:bg-muted"
                >
                  <div className="relative h-4 w-4">
                    <svg
                      className="h-4 w-4 absolute inset-0"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{
                        transition:
                          "opacity 400ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                        opacity: copied ? 1 : 0,
                        transform: copied ? "scale(1)" : "scale(0.4)",
                        pointerEvents: "none",
                      }}
                    >
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M20 6L9 17l-5-5"
                      />
                    </svg>
                    <svg
                      className="w-4 h-4"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                      style={{
                        position: "absolute",
                        inset: 0,
                        transition:
                          "opacity 400ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 400ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                        opacity: copied ? 0 : 1,
                        transform: copied ? "scale(0.4)" : "scale(1)",
                        pointerEvents: "none",
                      }}
                    >
                      <g
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      >
                        <rect
                          width="14"
                          height="14"
                          x="8"
                          y="8"
                          rx="2"
                          ry="2"
                        />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                      </g>
                    </svg>
                  </div>
                </button>
              </div>
            </div>
            <div className="bg-border w-px"></div>
            <div className="flex items-center justify-center aspect-square w-32 overflow-hidden rounded-xl border-4 shadow-2xl">
              <div
                className="[&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: shareQR }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
