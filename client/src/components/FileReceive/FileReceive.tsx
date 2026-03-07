import { useEffect, useReducer, useRef, useState } from "preact/hooks";
import { Spinner } from "../Spinner";
import { SpinnerAlternative } from "../SpinnerAlternative";
import {
  initialSocketState,
  socketStateReducer,
} from "./reducers/socketStateReducer";

export function FileReceive() {
  const [filename, setFilename] = useState("");
  const [filesize, setFilesize] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [socketState, socketStateDispatch] = useReducer(
    socketStateReducer,
    initialSocketState,
  );

  const socketRef = useRef<WebSocket | null>(null);
  const leechRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const transferId = searchParams.get("transferId");

    const leech = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const socket = new WebSocket(
      `ws://localhost:8000?transferId=${transferId}`,
    );

    leechRef.current = leech;
    socketRef.current = socket;

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

    socket.addEventListener("error", () => {
      socketStateDispatch({ type: "ERROR" });
    });

    socket.addEventListener("message", async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "metadata") {
        setFilename(msg.filename);
        setFilesize(msg.filesize);
        socketStateDispatch({ type: "CONNECTED" });
      } else if (msg.type === "incoming:answer") {
        await leech.setRemoteDescription(new RTCSessionDescription(msg.answer));
      } else if (msg.type === "transfer:candidate") {
        await leech.addIceCandidate(msg.candidate);
      }
    });

    leech.onicecandidate = (event) => {
      if (event.candidate) {
        socket.send(
          JSON.stringify({
            type: "transfer:candidate",
            candidate: event.candidate,
          }),
        );
      }
    };

    leech.onconnectionstatechange = () => {
      if (leech.connectionState === "connected") console.log("Peers connected");
    };

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      socket.close();
      leech.close();
    };
  }, []);

  const handleDownload = async () => {
    if (channelRef.current) return;
    const socket = socketRef.current;
    const leech = leechRef.current;
    if (!socket || !leech) return;

    setDownloading(true);
    const channel = leech.createDataChannel("file-transfer");
    channel.binaryType = "arraybuffer";
    channelRef.current = channel;

    let dataArray: BlobPart[] = [];
    let receivedSize = 0;
    channel.onmessage = (event) => {
      const { data } = event;
      if (data.toString() === "done") {
        channel.close();
        const blob = new Blob(dataArray);
        const a = document.createElement("a");
        const url = window.URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        dataArray = [];
        setDownloading(false);
      } else {
        dataArray.push(data);
        const chunkSize = data.byteLength || data.size;
        receivedSize += chunkSize;
        console.log(Math.ceil(receivedSize / (filesize / 100)) + "%");
      }
    };

    const offer = await leech.createOffer();
    await leech.setLocalDescription(offer);
    socket.send(
      JSON.stringify({ type: "make:offer", offer: leech.localDescription }),
    );
  };

  if (socketState.status === "connecting")
    return (
      <div class="flex mx-16 items-center justify-center w-full gap-2">
        <Spinner />
        <p className="text-xl">Connecting to sender</p>
      </div>
    );

  if (socketState.status === "error")
    return (
      <div class="flex mx-16 items-center justify-center w-full gap-2">
        <div className="border rounded-lg p-4 flex flex-col gap-4">
          <p className="text-xl w-3xs flex-wrap">
            The sender has either closed this transfer or is now offline. Please
            check if the sender has an active internet connection or ask for a
            new link.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 cursor-pointer font-sans font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition-all duration-200 bg-foreground text-background"
          >
            Reload
          </button>
        </div>
      </div>
    );

  return (
    <div class="flex mx-16 items-center justify-center w-full gap-2">
      <div className="border rounded-lg p-4 flex flex-col gap-4">
        <div className="flex flex-col w-3xs">
          <h3 className="text-xl truncate">{filename}</h3>
          <p>{(filesize / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className={`px-4 py-2 ${downloading ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:opacity-90"} font-sans font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition-all duration-200 bg-foreground text-background`}
        >
          {downloading ? (
            <>
              <SpinnerAlternative /> Downloading
            </>
          ) : (
            "Download"
          )}
        </button>
      </div>
    </div>
  );
}
