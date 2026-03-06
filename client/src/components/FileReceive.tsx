import { useEffect, useRef, useState } from "preact/hooks";
import { Spinner } from "./Spinner";

export function FileReceive() {
  const [connected, setConnected] = useState(false);
  const [filename, setFilename] = useState("");
  const [filesize, setFilesize] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const leechRef = useRef<RTCPeerConnection | null>(null);

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

    socket.addEventListener("message", async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "metadata") {
        setFilename(msg.filename);
        setFilesize(msg.filesize);
        setConnected(true);
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
    const socket = socketRef.current;
    const leech = leechRef.current;
    if (!socket || !leech) return;

    const channel = leech.createDataChannel("file-transfer");
    const offer = await leech.createOffer();
    await leech.setLocalDescription(offer);
    socket.send(
      JSON.stringify({ type: "make:offer", offer: leech.localDescription }),
    );
  };

  return (
    <div class="flex mx-16 items-center justify-center w-full gap-2">
      {!connected ? (
        <>
          <Spinner /> <p class="text-xl">Connecting to sender</p>
        </>
      ) : (
        <div className="border rounded-lg p-4 flex flex-col gap-4">
          <div className="flex flex-col w-3xs">
            <h3 className="text-xl truncate">{filename}</h3>
            <p>{(filesize / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <button
            onClick={handleDownload}
            className="px-4 py-2 cursor-pointer font-sans font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition-colors bg-foreground text-background hover:opacity-90"
          >
            Download
          </button>
        </div>
      )}
    </div>
  );
}
