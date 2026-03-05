import QRCode from "qrcode";

export async function generateQR(url: string) {
  const svg = await QRCode.toString(url, {
    type: "svg",
    color: { dark: "#c2c0b6", light: "#RRGGBBAA" },
    margin: 0,
  });
  return svg;
}
