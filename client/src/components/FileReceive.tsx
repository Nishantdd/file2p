import { useEffect, useState } from "preact/hooks";
import { Spinner } from "./Spinner";

export function FileReceive() {
  const [connected, setConnected] = useState(false);
  const [filename, setFilename] = useState("");
  const [filesize, setFilesize] = useState(0);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const transferId = searchParams.get("transferId");
    const socket = new WebSocket(
      `ws://localhost:8000?transferId=${transferId}`,
    );

    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      console.log(data);
      setFilename(data.filename);
      setFilesize(data.filesize);
      setConnected(true);
    });

    return () => socket.close();
  }, []);

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
          <button className="px-4 py-2 cursor-pointer font-sans font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition-colors bg-foreground text-background hover:opacity-90">
            Download
          </button>
        </div>
      )}
    </div>
  );
}
