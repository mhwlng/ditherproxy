import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Canvas } from "@napi-rs/canvas";

import * as epdoptimize from "epdoptimize";
import type * as epdoptimizetype from "epdoptimize";

import express from "express";
import type { Request, Response } from "express";

import rateLimit from "express-rate-limit";

import helmet from "helmet";

import * as http from "node:http";
import * as https from "node:https";
import path from "node:path";

const port = process.env.PORT || 3000;

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const REQUEST_TIMEOUT = 30000; // 30 seconds

const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Limit each IP to 30 requests per windowMs
  message: "Too many dithering requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});


interface DitherConfig {
  imageAdjustmentOptions: epdoptimizetype.DitherImageOptions;
  canvasDitherOptions: epdoptimizetype.DitherImageOptions;
  palette: string | epdoptimizetype.PaletteColorEntry[];
}

const app = express();

app.use(limiter);

app.use(helmet());

function isValidHttpUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    // Only allow http and https
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    // Block private IP ranges and localhost
    const hostname = url.hostname;
    const blockedPatterns = [
      /^localhost$/,
      /^127\./,
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^::1$/,
      /^fc00:/,
      /^169\.254\./,
      /^metadata\.google\.internal$/,
      /^169\.254\.169\.254$/,
    ];
    return !blockedPatterns.some(pattern => pattern.test(hostname));
  } catch {
    return false;
  }
}

async function loadImageWithTimeout(
  url: string,
  timeoutMs: number = REQUEST_TIMEOUT
): Promise<Awaited<ReturnType<typeof loadImage>>> {
  return Promise.race([
    loadImage(url),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Image load timeout")), timeoutMs)
    ),
  ]);
}

async function httpGet(url: string | URL): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.toString().startsWith("https") ? https : http;
    let receivedSize = 0;
    const chunks: Buffer[] = [];

    const request = client.get(url, (resp) => {
      const contentLength = parseInt(resp.headers['content-length'] || '0', 10);
      if (contentLength > MAX_FILE_SIZE) {
        resp.destroy();
        reject(new Error(`File too large`));
        return;
      }

      resp.on("data", (chunk: Buffer) => {
        receivedSize += chunk.length;
        if (receivedSize > MAX_FILE_SIZE) {
          resp.destroy();
          reject(new Error(`File exceeds size limit`));
          return;
        }
        chunks.push(chunk);
      });

      resp.on("end", () => resolve(Buffer.concat(chunks)));
    });

    request.setTimeout(REQUEST_TIMEOUT, () => {
      request.destroy();
      reject(new Error("Request timeout"));
    });

    request.on("error", reject);
  });
}

async function dither(
    img: Awaited<ReturnType<typeof loadImage>>,
    config: DitherConfig
    ) : Promise<Canvas> {

    const src = createCanvas(img.width, img.height);

    const srcCtx = src.getContext("2d");
    srcCtx.drawImage(img, 0, 0);

    const int = createCanvas(img.width, img.height);

    const dst = createCanvas(img.width, img.height);

    var palette = config.palette;
    
    if (typeof palette == "string")
    {
        palette = eval("epdoptimize."+palette);
    }
    
    await epdoptimize.ditherImage(src, int, {
        ...config.imageAdjustmentOptions,
        ...config.canvasDitherOptions,
        palette : palette
    } );
        
    epdoptimize.replaceColors(int, dst, palette as epdoptimizetype.PaletteColorEntry[]);

    return dst;
}

export function findClosestPaletteColor(
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

app.get(['/', '/ditherproxy'], async (req: Request, res: Response) => {

    const { url: imageUrl, jsonurl: jsonUrl, tobin: toBin } = req.query;

    if (!imageUrl || !jsonUrl) {
        return res.status(400).send("Missing required parameters: url and jsonurl");
    }

    if (!isValidHttpUrl(imageUrl as string)) {
        return res.status(400).send(`imageurl is not a valid url ${imageUrl}`);
     }
    if (!isValidHttpUrl(jsonUrl as string)) {
        return res.status(400).send(`jsonurl is not a valid url ${jsonUrl}`);
    }

    try {

        const [img, jsonBuffer] = await Promise.all([
            loadImageWithTimeout(imageUrl as string),
            httpGet(jsonUrl as string),
        ]);   

        const config: DitherConfig = JSON.parse(jsonBuffer.toString('utf-8'));

        var ditherCanvas = await dither(img,config);

        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");

        if (toBin){

            var srcCtx = ditherCanvas.getContext("2d");

            var imageData = srcCtx.getImageData(0, 0, img.width, img.height);
            switch (toBin)
            {
                case "10": // DL0750WF (BWR)
                case "15": // DL1020WF (BWR)

                     var binBuffer1 = toRGBBuffer(
                        imageData.data, 
                        img.width, 
                        img.height
                    );

                    if (binBuffer1)
                    {
                        res.contentType("application/octet-stream");
                        console.log (binBuffer1.byteLength);    
                        res.end(binBuffer1); 

                        return;

                    } else {
                         return res.status(500).send("toRGBBuffer failed");
                    }

                    break;
                case "23": // DL0730W6 (SPECTRA6)

                    var binBuffer2 = toE6Buffer(
                        imageData.data, 
                        img.width, 
                        img.height);

                    if (binBuffer2)
                    {
                        res.contentType("application/octet-stream");
                        console.log (binBuffer2.byteLength);    
                        res.end(binBuffer2);    

                        return;

                    } else {
                         return res.status(500).send("toE6Buffer failed");
                    }

                    break;
            }
        }

        res.contentType("image/png");

        const pngBuffer = ditherCanvas.toBuffer("image/png");

        //console.log (pngBuffer.byteLength);    

        res.end(pngBuffer); 
  } 
  catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Dithering failed: ${errorMessage}`);
  }
});

app.get('/health', async (req: Request, res: Response) => {
  try {
              
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }

});

const server = app.listen(port, (err?: Error) =>
  console.log(err ? `Error listening on port ${port} : ${err}` : `Listening on port ${port}`)
);

process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');

  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced exit after timeout');
    process.exit(1);
  }, 25000); 
});

