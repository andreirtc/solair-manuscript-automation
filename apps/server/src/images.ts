/** Read dimensions from image bytes, not the browser's MIME or filename. No decoding shell command. */
export function imageInfo(
  bytes: Buffer,
):
  | { width: number; height: number; mime: "image/png" | "image/jpeg" }
  | undefined {
  let width = 0,
    height = 0,
    mime: "image/png" | "image/jpeg";
  if (
    bytes.length >= 33 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  ) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
    mime = "image/png";
  } else if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    mime = "image/jpeg";
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 8
      ) {
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
        break;
      }
      offset += length;
    }
  } else return;
  if (width < 1 || height < 1 || width * height > 25_000_000)
    throw new Error("Images must be valid PNG/JPEG and at most 25 megapixels.");
  return { width, height, mime };
}
