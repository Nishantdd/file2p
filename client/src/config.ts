type Config = {
  APP_ADDR: string;
  SERVER_ADDR: string;
};

const localConfig: Config = {
  APP_ADDR: "http://localhost:5173",
  SERVER_ADDR: "ws://localhost:8000"
};

const prodConfig: Config = {
  APP_ADDR: "https://papershare-mu.vercel.app",
  SERVER_ADDR: "wss://connect.caraxes.in"
};

const isProduction = window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";

export const config = isProduction ? prodConfig : localConfig;
