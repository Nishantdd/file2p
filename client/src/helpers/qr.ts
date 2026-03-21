import { toString as qrToString } from "qrcode";

export async function generateQR(url: string): Promise<string> {
  return qrToString(url, {
    type: "svg",
    color: { dark: "#000000", light: "#00000000" },
    margin: 0
  });
}
