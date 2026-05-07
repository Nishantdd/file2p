export const DATA_CHANNEL_LABEL = "file-transfer";

export const DEFAULT_CHUNK_SIZE = 64 * 1024;
export const MAX_COMPATIBLE_CHUNK_SIZE = 256 * 1024;
export const BUFFER_HIGH_WATER = 8 * 1024 * 1024;
export const BUFFER_LOW_WATER = 2 * 1024 * 1024;
export const UI_UPDATE_INTERVAL_MS = 150;

export type TransferControlMessage =
  | {
      type: "transfer:start";
      filename: string;
      filesize: number;
      chunkSize: number;
    }
  | {
      type: "transfer:complete";
      bytesSent: number;
    }
  | {
      type: "transfer:cancel";
    }
  | {
      type: "transfer:error";
      message: string;
    };

export const encodeControlMessage = (message: TransferControlMessage) => JSON.stringify(message);

export const parseControlMessage = (data: unknown): TransferControlMessage | null => {
  if (typeof data !== "string") return null;

  try {
    const parsed = JSON.parse(data) as Partial<TransferControlMessage>;
    if (!parsed || typeof parsed.type !== "string" || !parsed.type.startsWith("transfer:")) return null;
    return parsed as TransferControlMessage;
  } catch {
    return null;
  }
};

export const getUsableChunkSize = (peer: RTCPeerConnection) => {
  const maxMessageSize = peer.sctp?.maxMessageSize;
  if (!maxMessageSize) return MAX_COMPATIBLE_CHUNK_SIZE;

  return Math.max(DEFAULT_CHUNK_SIZE, Math.min(MAX_COMPATIBLE_CHUNK_SIZE, maxMessageSize));
};

export const formatBytes = (bytes: number) => {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

export const formatSpeed = (bytesPerSecond: number) => `${(bytesPerSecond / 1048576).toFixed(1)} MB/s`;
