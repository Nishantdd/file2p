export type SocketState =
  | { status: "connecting" }
  | { status: "connected" }
  | { status: "error"; message?: string };

export type SocketAction =
  | { type: "CONNECTED" }
  | { type: "ERROR"; message?: string };

export const initialSocketState: SocketState = {
  status: "connecting",
};

export function socketStateReducer(
  state: SocketState,
  action: SocketAction,
): SocketState {
  switch (action.type) {
    case "CONNECTED":
      return { status: "connected" };
    case "ERROR":
      return { status: "error", message: action.message };
    default:
      return state;
  }
}
