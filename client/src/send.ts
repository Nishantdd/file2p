import { switchSendStates } from "./helpers/switch-helpers";
import { generateQR } from "./helpers/qr";
import { config } from "./config";

const CHUNK_SIZE = 256 * 1024;

const dropzone = document.getElementById("send-dropzone") as HTMLDivElement;
const fileInput = document.getElementById("send-file-input") as HTMLInputElement;
const sendQR = document.getElementById("send-qr") as HTMLDivElement;
const sendFilename = document.getElementById("send-filename") as HTMLElement;
const sendFilesize = document.getElementById("send-filesize") as HTMLElement;
const sendCode = document.getElementById("send-code") as HTMLInputElement;
const sendCopyBtn = document.getElementById("send-copy-btn") as HTMLButtonElement;
const sendResetBtn = document.getElementById("send-reset-btn") as HTMLButtonElement;
const sendStates = document.querySelectorAll<HTMLDivElement>("#send-panel > div[data-state]");

let peer: RTCPeerConnection | null = null;
let currentSocket: WebSocket | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

const generateTransferId = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const closePeer = () => {
  if (!peer) return;
  peer.onicecandidate = null;
  peer.ondatachannel = null;
  peer.onconnectionstatechange = null;
  peer.close();
  peer = null;
};

const handleFileSelect = async (file: File) => {
  clearInterval(heartbeatInterval);
  currentSocket?.close();
  currentSocket = null;
  closePeer();

  const p = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  peer = p;

  const transferId = generateTransferId();
  const link = new URL(`/?transferId=${encodeURIComponent(transferId)}`, config.APP_ADDR).toString();
  const qrSvg = await generateQR(link);

  sendQR.innerHTML = qrSvg;
  sendFilename.textContent = file.name;
  sendFilesize.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
  sendCode.value = transferId;

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
      await p.setRemoteDescription(new RTCSessionDescription(msg.offer));
      const answer = await p.createAnswer();
      await p.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: "make:answer", answer: p.localDescription }));
    } else if (msg.type === "transfer:candidate") {
      await p.addIceCandidate(msg.candidate);
    }
  });

  p.onicecandidate = event => {
    if (event.candidate) {
      socket.send(JSON.stringify({ type: "transfer:candidate", candidate: event.candidate }));
    }
  };

  p.ondatachannel = event => {
    const channel = event.channel;
    channel.onopen = () => {
      file.arrayBuffer().then(buf => {
        let buffer = buf;

        const send = () => {
          if (!buffer.byteLength) {
            channel.send("done");
            return;
          }
          const chunk = buffer.slice(0, CHUNK_SIZE);
          buffer = buffer.slice(CHUNK_SIZE);
          channel.send(chunk);

          if (channel.bufferedAmount > channel.bufferedAmountLowThreshold) {
            channel.onbufferedamountlow = () => {
              channel.onbufferedamountlow = null;
              send();
            };
          } else {
            send();
          }
        };

        send();
      });
    };
  };
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
  await navigator.clipboard.writeText(sendCode.value);
  const prev = sendCopyBtn.textContent;
  sendCopyBtn.textContent = "COPIED!";
  setTimeout(() => (sendCopyBtn.textContent = prev), 500);
});

sendResetBtn.addEventListener("click", () => {
  clearInterval(heartbeatInterval);
  currentSocket?.close();
  currentSocket = null;
  fileInput.value = "";
  closePeer();
  switchSendStates(sendStates, "upload");
});
