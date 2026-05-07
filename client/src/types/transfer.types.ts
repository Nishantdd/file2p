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

export type FileSystemWritableFileStream = {
  write: (data: BlobPart) => Promise<void>;
  close: () => Promise<void>;
  abort?: () => Promise<void>;
};

export type FileSystemFileHandle = {
  createWritable: () => Promise<FileSystemWritableFileStream>;
};

export type WindowWithSavePicker = Window &
  typeof globalThis & {
    showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<FileSystemFileHandle>;
  };
