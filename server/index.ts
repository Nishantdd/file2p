type SocketData =
  | {
      transferId: string;
      role: "host";
      filename: string;
      filesize: number;
    }
  | {
      transferId: string;
      role: "leecher";
    };

interface FileMetadata {
  filename: string;
  filesize: number;
}

const isWholeNumber = (str: string) => /^\d+$/.test(str);

const hostSocketMap = new Map<string, Bun.ServerWebSocket<SocketData>>();
const leecherSocketMap = new Map<string, Bun.ServerWebSocket<SocketData>>();
const fileMetadataMap = new Map<string, FileMetadata>();

const server = Bun.serve({
  port: 8000,
  fetch(req, server) {
    const url = new URL(req.url);
    const transferId = url.searchParams.get("transferId");
    if (!transferId) return new Response("Upgrade failed", { status: 400 });
    const filename = url.searchParams.get("filename");
    const filesizeString = url.searchParams.get("filesize");
    const filesize = Number.parseInt(filesizeString || "0");
    const role = (url.searchParams.get("role") || "leecher") as
      | "host"
      | "leecher";

    if (role === "host") {
      if (!filename || !filesizeString || !isWholeNumber(filesizeString)) {
        return new Response("Upgrade failed", { status: 400 });
      } else {
        const success = server.upgrade(req, {
          data: { transferId, role, filename, filesize },
        });
        if (!success) return new Response("Upgrade failed", { status: 500 });
      }
    } else {
      const hostExist = hostSocketMap.has(transferId);
      if (!hostExist) return new Response("Upgrade failed", { status: 404 });
      const success = server.upgrade(req, { data: { transferId, role } });
      if (!success) return new Response("Upgrade failed", { status: 500 });
    }
  },
  websocket: {
    data: {} as SocketData,

    open(ws) {
      if (ws.data.role === "host") {
        hostSocketMap.set(ws.data.transferId, ws);
        fileMetadataMap.set(ws.data.transferId, {
          filename: ws.data.filename,
          filesize: ws.data.filesize,
        });
      } else {
        leecherSocketMap.set(ws.data.transferId, ws);
        const fileMetadata = fileMetadataMap.get(ws.data.transferId)!;
        ws.send(
          JSON.stringify({
            type: "metadata",
            filename: fileMetadata.filename,
            filesize: fileMetadata.filesize,
          }),
        );
      }
    },

    message(ws, raw) {
      const msg = JSON.parse(raw as string);
      if (msg.type === "heartbeat") {
        ws.send(
          JSON.stringify({
            type: "heartbeat",
            timestamp: Date.now(),
          }),
        );
      }
    },

    close(ws) {
      if (ws.data.role === "host") {
        hostSocketMap.delete(ws.data.transferId);
        fileMetadataMap.delete(ws.data.transferId);
      } else {
        leecherSocketMap.delete(ws.data.transferId);
      }
    },
  },
});

console.log(`Signalling server running at ${server.url}`);
