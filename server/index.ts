type SocketData = {
  peerId: string;
  transferId: string;
  role: "host" | "leecher";
};

const transferMap = new Map<string, Bun.ServerWebSocket<SocketData>>();

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
        const hostWebSocket = transferMap.get(ws.data.transferId)!;
        hostWebSocket.send(
          JSON.stringify({ type: "message", from: ws.data.peerId }),
        );
      }
    },

    message(ws, raw) {
      const msg = JSON.parse(raw as string);
    },

    close(ws) {
      transferMap.delete(ws.data.transferId);
    },
  },
});

console.log(`Signalling server running at ${server.url}`);
