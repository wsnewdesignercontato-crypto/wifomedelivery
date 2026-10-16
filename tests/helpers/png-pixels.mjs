import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

// Read the actual exported RGB/RGBA pixels, including all PNG scanline filters.
export function pngPixels(png) {
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  assert.equal(png[24], 8, "Exports must use 8-bit channels");
  assert.ok([2, 6].includes(png[25]), "Expected RGB or RGBA export");
  assert.equal(png[28], 0, "Expected a non-interlaced export");
  const channels = png[25] === 2 ? 3 : 4,
    chunks = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset),
      type = png.subarray(offset + 4, offset + 8).toString();
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)),
    stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= channels ? pixels[index - channels] : 0;
      const above = y > 0 ? pixels[index - stride] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[index - stride - channels] : 0;
      const estimate = left + above - upperLeft;
      const distances = [
        Math.abs(estimate - left),
        Math.abs(estimate - above),
        Math.abs(estimate - upperLeft),
      ];
      const paeth =
        distances[0] <= distances[1] && distances[0] <= distances[2]
          ? left
          : distances[1] <= distances[2]
            ? above
            : upperLeft;
      const predictor = [0, left, above, Math.floor((left + above) / 2), paeth][filter];
      pixels[index] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return {
    width,
    height,
    at: (x, y) => {
      const offset = (y * width + x) * channels;
      return [...pixels.subarray(offset, offset + 3), channels === 4 ? pixels[offset + 3] : 255];
    },
  };
}
