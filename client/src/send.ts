import { switchSendStates } from "./helpers/switch-helpers";
import { generateQR } from "./helpers/qr";
import { config } from "./config";
import {
  BUFFER_HIGH_WATER,
  BUFFER_LOW_WATER,
  DATA_CHANNEL_LABEL,
  UI_UPDATE_INTERVAL_MS,
  encodeControlMessage,
  getUsableChunkSize,
  parseControlMessage
} from "./helpers/transfer";

const dropzone = document.getElementById("send-dropzone") as HTMLDivElement;
const fileInput = document.getElementById("send-file-input") as HTMLInputElement;
const sendQR = document.getElementById("send-qr") as HTMLDivElement;
const sendFilename = document.getElementById("send-filename") as HTMLElement;
const sendFilesize = document.getElementById("send-filesize") as HTMLElement;
const sendCode = document.getElementById("send-code") as HTMLInputElement;
const sendFooterLabel = document.getElementById("send-footer-label") as HTMLElement;
const sendFooterIndicator = document.getElementById("send-footer-indicator") as HTMLElement;
const sendCopyBtn = document.getElementById("send-copy-btn") as HTMLButtonElement;
const sendResetBtn = document.getElementById("send-reset-btn") as HTMLButtonElement;
const sendStates = document.querySelectorAll<HTMLDivElement>("#send-panel > div[data-state]");

let peer: RTCPeerConnection | null = null;
let channel: RTCDataChannel | null = null;
let currentSocket: WebSocket | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
let abortTransfer: (() => void) | null = null;
let transferCompleted = false;
let currentShareLink = "";

const generateTransferId = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const closePeer = () => {
  abortTransfer?.();
  abortTransfer = null;
  if (channel) {
    channel.onopen = null;
    channel.onclose = null;
    channel.onerror = null;
    channel.onbufferedamountlow = null;
    channel.close();
    channel = null;
  }
  if (!peer) return;
  peer.onicecandidate = null;
  peer.ondatachannel = null;
  peer.onconnectionstatechange = null;
  peer.close();
  peer = null;
};

const closeSocket = () => {
  currentSocket?.close();
  currentSocket = null;
};

const setSendFooterStatus = (label: string, state: "idle" | "connected" | "progress" | "complete", progress = 0) => {
  sendFooterLabel.textContent = label;
  sendFooterIndicator.dataset.state = state;
  sendFooterIndicator.style.setProperty("--progress", `${Math.min(100, Math.max(0, progress))}%`);
};

const resetSendProgress = () => {
  setSendFooterStatus("No receiver", "idle");
};

const waitForBufferLow = (ch: RTCDataChannel, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ch.bufferedAmount <= ch.bufferedAmountLowThreshold) {
      resolve();
      return;
    }

    const cleanup = () => {
      ch.removeEventListener("bufferedamountlow", handleLow);
      ch.removeEventListener("close", handleClose);
      ch.removeEventListener("error", handleError);
      signal.removeEventListener("abort", handleAbort);
    };

    const handleLow = () => {
      cleanup();
      resolve();
    };

    const handleClose = () => {
      cleanup();
      reject(new Error("Data channel closed"));
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Data channel error"));
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException("Transfer cancelled", "AbortError"));
    };

    ch.addEventListener("bufferedamountlow", handleLow, { once: true });
    ch.addEventListener("close", handleClose, { once: true });
    ch.addEventListener("error", handleError, { once: true });
    signal.addEventListener("abort", handleAbort, { once: true });
  });

const createHostPeer = (socket: WebSocket, file: File) => {
  const p = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun.l.google.com:5349" },
      { urls: "stun:stun1.l.google.com:3478" },
      { urls: "stun:stun1.l.google.com:5349" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:5349" },
      { urls: "stun:stun3.l.google.com:3478" },
      { urls: "stun:stun3.l.google.com:5349" },
      { urls: "stun:stun4.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:5349" }
    ]
  });

  peer = p;
  transferCompleted = false;

  p.onicecandidate = event => {
    if (event.candidate) {
      socket.send(JSON.stringify({ type: "transfer:candidate", candidate: event.candidate }));
    }
  };

  p.onconnectionstatechange = () => {
    if (p.connectionState === "failed" || p.connectionState === "disconnected") {
      if (!transferCompleted) setSendFooterStatus("No receiver", "idle");
      abortTransfer?.();
    }
  };

  p.ondatachannel = event => {
    if (event.channel.label !== DATA_CHANNEL_LABEL) {
      event.channel.close();
      return;
    }

    const ch = event.channel;
    channel = ch;
    setSendFooterStatus("Receiver online", "connected");

    ch.onopen = () => {
      const controller = new AbortController();
      abortTransfer = () => controller.abort();
      void streamFile(file, ch, p, controller.signal).catch(() => undefined);
    };

    ch.onmessage = event => {
      const controlMessage = parseControlMessage(event.data);
      if (controlMessage?.type === "transfer:cancel") {
        abortTransfer?.();
      }
    };

    ch.onclose = () => {
      ch.onmessage = null;
      channel = null;
      abortTransfer = null;
    };

    ch.onerror = () => {
      setSendFooterStatus("No receiver", "idle");
      abortTransfer?.();
    };
  };

  return p;
};

const streamFile = async (file: File, ch: RTCDataChannel, p: RTCPeerConnection, signal: AbortSignal) => {
  const chunkSize = getUsableChunkSize(p);
  const reader = file.stream().getReader();
  let pending: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let bytesSent = 0;
  let lastUiUpdate = 0;

  ch.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
  ch.send(encodeControlMessage({ type: "transfer:start", filename: file.name, filesize: file.size, chunkSize }));

  const updateProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastUiUpdate < UI_UPDATE_INTERVAL_MS) return;

    const percentage = file.size ? Math.min(100, Math.floor((bytesSent / file.size) * 100)) : 100;
    setSendFooterStatus("Receiver online", "progress", percentage);
    lastUiUpdate = now;
  };

  const sendChunk = (chunk: Uint8Array<ArrayBuffer>) => {
    ch.send(chunk);
    bytesSent += chunk.byteLength;
    updateProgress();
  };

  try {
    while (!signal.aborted) {
      while (pending.byteLength >= chunkSize) {
        sendChunk(pending.slice(0, chunkSize));
        pending = pending.slice(chunkSize);

        if (ch.bufferedAmount >= BUFFER_HIGH_WATER) {
          await waitForBufferLow(ch, signal);
        }
      }

      const result = await reader.read();
      if (result.done) break;

      const next = result.value;
      if (!pending.byteLength) {
        pending = next;
      } else {
        const combined = new Uint8Array(pending.byteLength + next.byteLength);
        combined.set(pending);
        combined.set(next, pending.byteLength);
        pending = combined;
      }
    }

    if (signal.aborted) throw new DOMException("Transfer cancelled", "AbortError");
    if (pending.byteLength) sendChunk(pending);
    await waitForBufferLow(ch, signal);
    ch.send(encodeControlMessage({ type: "transfer:complete", bytesSent }));
    transferCompleted = true;
    setSendFooterStatus("Download Completed", "complete", 100);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (ch.readyState === "open") {
      if (error instanceof DOMException && error.name === "AbortError") {
        ch.send(encodeControlMessage({ type: "transfer:cancel" }));
      } else {
        const message = error instanceof Error ? error.message : "Transfer failed";
        ch.send(encodeControlMessage({ type: "transfer:error", message }));
      }
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      setSendFooterStatus("Receiver online", "connected");
    } else {
      setSendFooterStatus("No receiver", "idle");
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
};

const handleFileSelect = async (file: File) => {
  clearInterval(heartbeatInterval);
  closePeer();
  closeSocket();

  const transferId = generateTransferId();
  const link = new URL(`/?transferId=${encodeURIComponent(transferId)}`, config.APP_ADDR).toString();
  const qrSvg = await generateQR(link);
  currentShareLink = link;

  sendQR.innerHTML = qrSvg;
  sendFilename.textContent = file.name;
  sendFilesize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
  sendCode.value = transferId;
  resetSendProgress();

  switchSendStates(sendStates, "ready");

  const wsUrl = new URL(config.SERVER_ADDR);
  wsUrl.searchParams.set("role", "host");
  wsUrl.searchParams.set("transferId", transferId);
  wsUrl.searchParams.set("filename", file.name);
  wsUrl.searchParams.set("filesize", file.size.toString());

  const socket = new WebSocket(wsUrl);
  currentSocket = socket;

  socket.addEventListener("open", () => {
    heartbeatInterval = setInterval(() => {
      socket.send(JSON.stringify({ type: "event:heartbeat" }));
    }, 10000);
  });

  socket.addEventListener("message", async event => {
    const msg = JSON.parse(event.data);
    if (msg.type === "incoming:offer") {
      closePeer();
      const p = createHostPeer(socket, file);
      await p.setRemoteDescription(new RTCSessionDescription(msg.offer));
      const answer = await p.createAnswer();
      await p.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: "make:answer", answer: p.localDescription }));
    } else if (msg.type === "transfer:candidate") {
      await peer?.addIceCandidate(msg.candidate);
    } else if (msg.type === "receiver:connected") {
      setSendFooterStatus("Receiver online", "connected");
    } else if (msg.type === "receiver:disconnected") {
      setSendFooterStatus("No receiver", "idle");
    }
  });
};

dropzone.addEventListener("dragover", e => {
  e.preventDefault();
  dropzone.dataset.dragging = "true";
});

dropzone.addEventListener("dragleave", () => {
  dropzone.dataset.dragging = "false";
});

dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.dataset.dragging = "false";
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) handleFileSelect(files[0]);
});

dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", e => {
  const files = (e.currentTarget as HTMLInputElement).files;
  if (files && files.length > 0) handleFileSelect(files[0]);
});

sendCopyBtn.addEventListener("click", async () => {
  sendCopyBtn.disabled = true;
  await navigator.clipboard.writeText(currentShareLink || sendCode.value);
  const prev = sendCopyBtn.textContent;
  sendCopyBtn.textContent = "COPIED!";
  setTimeout(() => {
    sendCopyBtn.textContent = prev;
    sendCopyBtn.disabled = false;
  }, 1000);
});

sendResetBtn.addEventListener("click", () => {
  fileInput.value = "";
  clearInterval(heartbeatInterval);
  closePeer();
  closeSocket();
  currentShareLink = "";
  resetSendProgress();
  switchSendStates(sendStates, "upload");
});
