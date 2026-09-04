

import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Canvas } from "@napi-rs/canvas";

import * as epdoptimize from "epdoptimize";
import type * as epdoptimizetype from "epdoptimize";

export interface DitherConfig {
  imageAdjustmentOptions: epdoptimizetype.DitherImageOptions;
  canvasDitherOptions: epdoptimizetype.DitherImageOptions;
  palette: string | epdoptimizetype.PaletteColorEntry[];
}

export async function dither(
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

