type SocketData = {
  peerId: string;
  transferId: string;
  role: "host" | "leecher";
};

const transferMap = new Map<string, Bun.ServerWebSocket<SocketData>>();
const leecherSocketMap = new Map<string, Bun.ServerWebSocket<SocketData>>();

const server = Bun.serve({
  port: 8000,
  fetch(req, server) {
    const url = new URL(req.url);
    const transferId = url.searchParams.get("transferId")!;
    const peerId = crypto.randomUUID();
    const role = (url.searchParams.get("role") || "leecher") as
      | "host"
      | "leecher";

    if (server.upgrade(req, { data: { peerId, transferId, role } })) return;
    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    data: {} as SocketData,

    open(ws) {
      if (ws.data.role === "host") {
        transferMap.set(ws.data.transferId, ws);
      } else {
        leecherSocketMap.set(ws.data.transferId, ws);
        ws.send(
          JSON.stringify({
            filename: "Screenshot (1).png",
            filesize: 12399,
          }),
        );
      }
    },

    message(ws, raw) {
      const msg = JSON.parse(raw as string);
      console.log(msg);
      // if (msg.type == "metadata") {
      //   const leecherSocket = leecherSocketMap.get(ws.data.transferId)!;
      //   leecherSocket.send(
      //     JSON.stringify({
      //       type: "message",
      //       filename: msg.filename,
      //       filesize: msg.filesize,
      //     }),
      // );
      // }
    },

    close(ws) {
      transferMap.delete(ws.data.transferId);
      leecherSocketMap.delete(ws.data.transferId);
    },
  },
});

console.log(`Signalling server running at ${server.url}`);
