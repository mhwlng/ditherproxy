import { createCanvas, loadImage } from "@napi-rs/canvas";

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
  palette: epdoptimizetype.PaletteColorEntry[];
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
    ) : Promise<Buffer> {

    const src = createCanvas(img.width, img.height);

    const srcCtx = src.getContext("2d");
    srcCtx.drawImage(img, 0, 0);

    const int = createCanvas(img.width, img.height);

    const dst = createCanvas(img.width, img.height);

    await epdoptimize.ditherImage(src, int, {
        ...config.imageAdjustmentOptions,
        ...config.canvasDitherOptions,
        palette : config.palette,
    } );
        
    epdoptimize.replaceColors(int, dst, config.palette);

    return dst.toBuffer("image/png");
}

app.get(['/', '/ditherproxy'], async (req: Request, res: Response) => {

    const { url: imageUrl, jsonurl: jsonUrl } = req.query;

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

        var imgBuffer = await dither(img,config);

        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        res.contentType("image/png");
        res.end(imgBuffer); 
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

