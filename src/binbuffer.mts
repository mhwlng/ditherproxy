function findClosestPaletteColor(
    palette: number[][],
    r : number,
    g: number,
    b: number
) {
      const MIN = 3 * 255 * 255 + 1; 

      let bestIndex = 0;
      let min = MIN;
      for (let i = 0; i < palette.length; i++) {
        const rDiff = r - (palette[i]![0] ?? 0);
        const gDiff = g - (palette[i]![1] ?? 0);
        const bDiff = b - (palette[i]![2] ?? 0);
        const distance = rDiff * rDiff + gDiff * gDiff + bDiff * bDiff;
        if (distance < min) {
          min = distance;
          bestIndex = i;
        }
      } 

      return bestIndex;
}

export function toRGBBuffer(
    data: Uint8ClampedArray,
    width : number,
    height: number
): Uint8Array {

  const binarySize = Math.ceil((width * height) / 4);
  const binaryData = new Uint8Array(binarySize);

  const rOffset = Math.floor(binarySize / 2);

  let offset = 0;
  let counter = 0;

  const palette: number[][] = [
    [255, 255, 255], // white
    [255, 0, 0],     // red
    [0, 0, 0]        // black
  ];

  const values: number[][] = [
    [0x00, 0x00],
    [0x00, 0x01],
    [0x01, 0x00]
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;

      // find the closest palette color
      let bestIndex = findClosestPaletteColor(palette,r,g,b);

      const C = values[bestIndex] ?? [];

      // set bit for this pixel in the two halves
      binaryData[offset] = (binaryData[offset] ?? 0) | (((C[0] ?? 0) << (7 - counter)) & 0xff);
      if (offset + rOffset < binarySize) {
        binaryData[offset + rOffset] = (binaryData[offset + rOffset] ?? 0) | (((C[1] ?? 0) << (7 - counter)) & 0xff);
      }

      counter++;
      if (counter === 8) {
        counter = 0;
        offset++;

        if (offset < rOffset) {
          binaryData[offset] = 0;
          binaryData[offset + rOffset] = 0;
        }
      }
    }
  }

  return binaryData;
}

export function toE6Buffer(
    data: Uint8ClampedArray,
    width : number,
    height: number
): Uint8Array {
  const pixelCount = width * height;
  const binarySize = Math.ceil(pixelCount / 2);
  const binaryData = new Uint8Array(binarySize);

  // palette: white, yellow, red, green, blue, black
  const palette: Array<[number, number, number]> = [
    [255, 255, 255], // white
    [255, 255, 0],   // yellow
    [255, 0, 0],     // red
    [0, 255, 0],     // green
    [0, 0, 255],     // blue
    [0, 0, 0],       // black
  ];

  const values = [0x01, 0x02, 0x03, 0x06, 0x05, 0x00];

  let counter = 0; // 0 -> write to high nibble, 1 -> write to low nibble
  let offset = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4; // RGBA
      const r = data[idx] ?? 0;
      const g = data[idx + 1] ?? 0;
      const b = data[idx + 2] ?? 0;

      // find the closest palette color
      let bestIndex = findClosestPaletteColor(palette,r,g,b);

      const C = (values[bestIndex] ?? 0) & 0x0f; // ensure 4-bit

      // place into high nibble when counter == 0, low nibble when counter == 1
      const shift = 4 * (1 - counter); // 4 or 0
      const nibble = (C << shift) & 0xff;
      binaryData[offset] = (binaryData[offset] ?? 0) | nibble;
      
      counter++;
      if (counter === 2) {
        counter = 0;
        offset++;
      }
    }
  }

  return binaryData;
}

export function toDoubleE6Buffer(
    data: Uint8ClampedArray,
    width : number,
    height: number

): Uint8Array {

  const pixelCount = width * height;
  const binarySize = Math.ceil(pixelCount / 2);
  const binaryData = new Uint8Array(binarySize);

  // palette: white, yellow, red, green, blue, black
  const palette: number[][] = [
    [255, 255, 255], // white
    [255, 255, 0],   // yellow
    [255, 0, 0],     // red
    [0, 255, 0],     // green
    [0, 0, 255],     // blue
    [0, 0, 0]        // black
  ];

  const values = [0x01, 0x02, 0x03, 0x06, 0x05, 0x00];

  let counter = 0;
  let offset = 0;

  for (let k = 0; k < 2; k++) {
    const startY = Math.floor(((2 - k) * height) / 2) - 1;
    const endY = Math.floor(((1 - k) * height) / 2);

    for (let x = 0; x < width; x++) {
      for (let y = startY; y >= endY; y--) {
        const idx = (y * width + x) * 4;
        const r = data[idx] ?? 0;
        const g = data[idx + 1] ?? 0;
        const b = data[idx + 2] ?? 0;

        // find the closest palette color
        let bestIndex = findClosestPaletteColor(palette,r,g,b);

        const C = (values[bestIndex] ?? 0) & 0x0f; // ensure 4-bit

        // place into high nibble when counter == 0, low nibble when counter == 1
        const shift = 4 * (1 - counter); // 4 or 0
        const nibble = (C << shift) & 0xff;
        binaryData[offset] = (binaryData[offset] ?? 0) | nibble;

        counter++;
        if (counter === 2) {
          counter = 0;
          offset++;
        }
      }
    }
  }

  return binaryData;
}
