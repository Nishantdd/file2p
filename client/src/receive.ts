import { switchReceiveStates, switchTabs } from "./helpers/switch-helpers";
import { config } from "./config";

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
let receivedSize = 0;

export let transferSpeed = 0;
let lastMeasureTime = 0;
let lastMeasureSize = 0;

const LABEL_THRESHOLD = 11;

const cleanup = () => {
  clearInterval(heartbeatInterval);
  if (channel) {
    channel.onmessage = null;
    channel.onerror = null;
    channel.close();
    channel = null;
  }
  if (peer) {
    peer.onicecandidate = null;
    peer.onconnectionstatechange = null;
    peer.close();
    peer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
  dataArray = [];
  receivedSize = 0;
  transferSpeed = 0;
  lastMeasureTime = 0;
  lastMeasureSize = 0;
  downloadBtn.disabled = false;
};

const startConnection = (transferId: string) => {
  cleanup();
  currentTransferId = transferId;

  const p = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  const ws = new WebSocket(`${config.SERVER_ADDR}?transferId=${encodeURIComponent(transferId)}`);
  peer = p;
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
      switchReceiveStates(receiveStates, "ready");
    } else if (msg.type === "incoming:answer") {
      await p.setRemoteDescription(new RTCSessionDescription(msg.answer));
    } else if (msg.type === "transfer:candidate") {
      await p.addIceCandidate(msg.candidate);
    }
  });

  p.onicecandidate = event => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: "transfer:candidate", candidate: event.candidate }));
    }
  };

  p.onconnectionstatechange = () => {
    if (p.connectionState === "failed" || p.connectionState === "disconnected") {
      switchReceiveStates(receiveStates, "derr");
    }
  };
};

const handleDownload = async () => {
  if (channel || !socket || !peer) return;
  downloadBtn.disabled = true;

  const p = peer;
  const ws = socket;
  const ch = p.createDataChannel("file-transfer");
  ch.binaryType = "arraybuffer";
  channel = ch;

  dataArray = [];
  receivedSize = 0;
  lastMeasureTime = Date.now();
  lastMeasureSize = 0;

  progressBar.style.width = "0%";
  progressPct.textContent = "0%";
  progressPct.style.left = "0%";
  progressPct.style.transform = "translate(8px, -50%)";
  progressTnf.textContent = "...";

  switchReceiveStates(receiveStates, "dl");

  ch.onmessage = event => {
    const { data } = event;

    if (data === "done" || data.toString() === "done") {
      ch.close();
      channel = null;

      const blob = new Blob(dataArray);
      const a = document.createElement("a");
      const url = window.URL.createObjectURL(blob);
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      dataArray = [];
      downloadBtn.disabled = false;
      switchReceiveStates(receiveStates, "ready");
    } else {
      dataArray.push(data);
      receivedSize += (data as ArrayBuffer).byteLength;

      const now = Date.now();
      const elapsed = (now - lastMeasureTime) / 1000;
      if (elapsed >= 0.5) {
        transferSpeed = (receivedSize - lastMeasureSize) / elapsed;
        lastMeasureTime = now;
        lastMeasureSize = receivedSize;
      }

      const percentage = Math.min(100, Math.ceil((receivedSize / filesize) * 100));
      progressBar.style.width = `${percentage}%`;
      progressPct.textContent = `${percentage}%`;
      progressPct.style.left = `${percentage}%`;
      progressPct.style.transform =
        percentage >= LABEL_THRESHOLD ? "translate(calc(-100% - 8px), -50%)" : "translate(8px, -50%)";

      if (transferSpeed > 0) {
        progressTnf.textContent = `${(transferSpeed / 1048576).toFixed(1)}MB/s - ${(receivedSize / 1048576).toFixed(1)}MB received`;
      }
    }
  };

  ch.onerror = () => {
    channel = null;
    switchReceiveStates(receiveStates, "derr");
  };

  const offer = await p.createOffer();
  await p.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: "make:offer", offer: p.localDescription }));
};

codeInput.addEventListener("click", async () => {
  const existingCode = codeInput.value;
  const clipboardText = (await navigator.clipboard.readText()).trim();
  if (clipboardText.length === 6 && clipboardText !== existingCode) {
    codeInput.value = clipboardText;
  }
});

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
