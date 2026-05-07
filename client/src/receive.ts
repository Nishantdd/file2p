import { switchReceiveStates, switchTabs } from "./helpers/switch-helpers";
import { config } from "./config";
import {
  DATA_CHANNEL_LABEL,
  UI_UPDATE_INTERVAL_MS,
  encodeControlMessage,
  formatBytes,
  formatSpeed,
  parseControlMessage
} from "./helpers/transfer";
import type { FileSystemWritableFileStream, WindowWithSavePicker } from "./types/transfer.types";

const tabs = document.querySelectorAll<HTMLButtonElement>("[data-tab]");
const panels = document.querySelectorAll<HTMLDivElement>("[data-panel]");
const receiveStates = document.querySelectorAll<HTMLDivElement>("#receive-panel > div[data-state]");

const codeInput = document.getElementById("receive-code-input") as HTMLInputElement;
const connectBtn = document.getElementById("receive-connect-btn") as HTMLButtonElement;
const retryCerrBtn = document.getElementById("receive-retry-cerr") as HTMLButtonElement;
const receiveFilename = document.getElementById("receive-filename") as HTMLElement;
const receiveFilesize = document.getElementById("receive-filesize") as HTMLElement;
const downloadBtn = document.getElementById("receive-download-btn") as HTMLButtonElement;
const progressBar = document.getElementById("receive-progress-bar") as HTMLDivElement;
const progressPct = document.getElementById("receive-progress-pct") as HTMLElement;
const progressTnf = document.getElementById("receive-progress-tnf") as HTMLElement;
const cancelDlBtn = document.getElementById("receive-cancel-dl") as HTMLButtonElement;
const retryDerrBtn = document.getElementById("receive-retry-derr") as HTMLButtonElement;
const receiveFooterLabel = document.getElementById("receive-footer-label") as HTMLElement;
const receiveFooterIndicator = document.getElementById("receive-footer-indicator") as HTMLElement;

const syncUrl = (transferId: string | null) => {
  const url = transferId
    ? `${window.location.pathname}?transferId=${encodeURIComponent(transferId)}`
    : window.location.pathname;
  history.replaceState(null, "", url);
};

let socket: WebSocket | null = null;
let peer: RTCPeerConnection | null = null;
let channel: RTCDataChannel | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

let currentTransferId = "";
let filename = "";
let filesize = 0;
let dataArray: BlobPart[] = [];
let fileWriter: FileSystemWritableFileStream | null = null;
let receivedSize = 0;

export let transferSpeed = 0;
let lastMeasureTime = 0;
let lastMeasureSize = 0;
let lastUiUpdate = 0;

const LABEL_THRESHOLD = 11;

const setReceiveFooterStatus = (label: string, state: "online" | "offline") => {
  receiveFooterLabel.textContent = label;
  receiveFooterIndicator.dataset.state = state;
};

const closeTransferPeer = (notifyCancel: boolean) => {
  if (channel) {
    if (notifyCancel && channel.readyState === "open") {
      channel.send(encodeControlMessage({ type: "transfer:cancel" }));
    }
    channel.onmessage = null;
    channel.onerror = null;
    channel.onclose = null;
    channel.close();
    channel = null;
  }
  if (peer) {
    peer.onicecandidate = null;
    peer.onconnectionstatechange = null;
    peer.close();
    peer = null;
  }
};

const cleanup = () => {
  clearInterval(heartbeatInterval);
  closeTransferPeer(true);
  void fileWriter?.abort?.();
  fileWriter = null;
  if (socket) {
    socket.close();
    socket = null;
  }
  dataArray = [];
  receivedSize = 0;
  transferSpeed = 0;
  lastMeasureTime = 0;
  lastMeasureSize = 0;
  lastUiUpdate = 0;
  downloadBtn.disabled = false;
  setReceiveFooterStatus("Sender disconnected", "offline");
};

const createTransferPeer = (ws: WebSocket) => {
  closeTransferPeer(false);

  const p = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  peer = p;

  p.onicecandidate = event => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: "transfer:candidate", candidate: event.candidate }));
    }
  };

  p.onconnectionstatechange = () => {
    if (p.connectionState === "failed" || p.connectionState === "disconnected") {
      setReceiveFooterStatus("Sender disconnected", "offline");
      if (channel) switchReceiveStates(receiveStates, "derr");
    } else if (p.connectionState === "connected") {
      setReceiveFooterStatus("Sender online", "online");
    }
  };

  return p;
};

const startConnection = (transferId: string) => {
  cleanup();
  currentTransferId = transferId;

  const ws = new WebSocket(`${config.SERVER_ADDR}?transferId=${encodeURIComponent(transferId)}`);
  socket = ws;

  ws.addEventListener("open", () => {
    heartbeatInterval = setInterval(() => {
      ws.send(JSON.stringify({ type: "event:heartbeat" }));
    }, 10000);
  });

  ws.addEventListener("error", () => {
    switchReceiveStates(receiveStates, "cerr");
  });

  ws.addEventListener("message", async event => {
    const msg = JSON.parse(event.data);
    if (msg.type === "metadata") {
      filename = msg.filename;
      filesize = msg.filesize;
      receiveFilename.textContent = filename;
      receiveFilesize.textContent = `${(filesize / 1048576).toFixed(2)} MB`;
      setReceiveFooterStatus("Sender online", "online");
      switchReceiveStates(receiveStates, "ready");
    } else if (msg.type === "incoming:answer") {
      await peer?.setRemoteDescription(new RTCSessionDescription(msg.answer));
    } else if (msg.type === "transfer:candidate") {
      await peer?.addIceCandidate(msg.candidate);
    }
  });
};

const handleDownload = async () => {
  if (channel || !socket) return;
  downloadBtn.disabled = true;

  const ws = socket;
  const savePicker = (window as WindowWithSavePicker).showSaveFilePicker;
  if (savePicker) {
    try {
      const handle = await savePicker({
        suggestedName: filename
      });
      fileWriter = await handle.createWritable();
    } catch {
      downloadBtn.disabled = false;
      return;
    }
  }

  const p = createTransferPeer(ws);
  const ch = p.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
  ch.binaryType = "arraybuffer";
  channel = ch;

  dataArray = [];
  receivedSize = 0;
  lastMeasureTime = Date.now();
  lastMeasureSize = 0;
  lastUiUpdate = 0;

  progressBar.style.width = "0%";
  progressPct.textContent = "0%";
  progressPct.style.left = "0%";
  progressPct.style.transform = "translate(8px, -50%)";
  progressTnf.textContent = "...";

  switchReceiveStates(receiveStates, "dl");
  let writerQueue = Promise.resolve();

  const updateProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastUiUpdate < UI_UPDATE_INTERVAL_MS) return;

    const elapsed = (now - lastMeasureTime) / 1000;
    if (elapsed >= 0.5) {
      transferSpeed = (receivedSize - lastMeasureSize) / elapsed;
      lastMeasureTime = now;
      lastMeasureSize = receivedSize;
    }

    const percentage = filesize ? Math.min(100, Math.floor((receivedSize / filesize) * 100)) : 0;
    progressBar.style.width = `${percentage}%`;
    progressPct.textContent = `${percentage}%`;
    progressPct.style.left = `${percentage}%`;
    progressPct.style.transform =
      percentage >= LABEL_THRESHOLD ? "translate(calc(-100% - 8px), -50%)" : "translate(8px, -50%)";

    progressTnf.textContent =
      transferSpeed > 0
        ? `${formatSpeed(transferSpeed)} - ${formatBytes(receivedSize)} received`
        : `${formatBytes(receivedSize)} received`;
    lastUiUpdate = now;
  };

  const finishDownload = async (bytesSent: number) => {
    if (receivedSize !== filesize || bytesSent !== receivedSize) {
      throw new Error("Transfer size mismatch");
    }

    updateProgress(true);
    ch.close();
    channel = null;
    closeTransferPeer(false);

    if (fileWriter) {
      await writerQueue;
      await fileWriter.close();
      fileWriter = null;
    } else {
      const blob = new Blob(dataArray);
      const a = document.createElement("a");
      const url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    }

    dataArray = [];
    downloadBtn.disabled = false;
    setReceiveFooterStatus("Sender online", "online");
    switchReceiveStates(receiveStates, "input");
  };

  ch.onmessage = event => {
    const { data } = event;
    const controlMessage = parseControlMessage(data);

    if (controlMessage) {
      if (controlMessage.type === "transfer:start") {
        if (controlMessage.filename) filename = controlMessage.filename;
        if (controlMessage.filesize) filesize = controlMessage.filesize;
        receiveFilename.textContent = filename;
        receiveFilesize.textContent = `${(filesize / 1048576).toFixed(2)} MB`;
      } else if (controlMessage.type === "transfer:complete") {
        void finishDownload(controlMessage.bytesSent).catch(() => {
          void fileWriter?.abort?.();
          fileWriter = null;
          closeTransferPeer(false);
          switchReceiveStates(receiveStates, "derr");
        });
      } else if (controlMessage.type === "transfer:error" || controlMessage.type === "transfer:cancel") {
        void fileWriter?.abort?.();
        fileWriter = null;
        closeTransferPeer(false);
        switchReceiveStates(receiveStates, "derr");
      }
      return;
    }

    const chunk = data as ArrayBuffer;
    receivedSize += chunk.byteLength;

    if (fileWriter) {
      writerQueue = writerQueue
        .then(() => fileWriter?.write(chunk))
        .catch(() => {
          void fileWriter?.abort?.();
          fileWriter = null;
          closeTransferPeer(false);
          switchReceiveStates(receiveStates, "derr");
        });
    } else {
      dataArray.push(chunk);
    }

    updateProgress();
  };

  ch.onerror = () => {
    void fileWriter?.abort?.();
    fileWriter = null;
    closeTransferPeer(false);
    switchReceiveStates(receiveStates, "derr");
  };

  const offer = await p.createOffer();
  await p.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "make:offer", offer: p.localDescription }));
};

connectBtn.addEventListener("click", () => {
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;
  syncUrl(code);
  switchReceiveStates(receiveStates, "conn");
  startConnection(code);
});

codeInput.addEventListener("keydown", e => {
  if (e.key === "Enter") connectBtn.click();
});

retryCerrBtn.addEventListener("click", () => {
  cleanup();
  syncUrl(null);
  codeInput.value = "";
  switchReceiveStates(receiveStates, "input");
});

cancelDlBtn.addEventListener("click", () => {
  cleanup();
  syncUrl(null);
  codeInput.value = "";
  switchReceiveStates(receiveStates, "input");
});

downloadBtn.addEventListener("click", handleDownload);

retryDerrBtn.addEventListener("click", () => {
  cleanup();
  switchReceiveStates(receiveStates, "conn");
  startConnection(currentTransferId);
});

const params = new URLSearchParams(window.location.search);
const urlTransferId = params.get("transferId");
if (urlTransferId) {
  switchTabs(tabs, panels, "receive");
  codeInput.value = urlTransferId;
  switchReceiveStates(receiveStates, "conn");
  startConnection(urlTransferId);
}
