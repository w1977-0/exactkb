# exactkb

**图片压缩到精确 KB / Compress an image to an exact KB limit / 画像を正確なKBに圧縮** — batch-resize and compress images so they fit the exact byte caps that registration systems, visa forms and chat apps demand. All in your browser: no upload, no server, no watermark, free.

> **中文** — 免费在线图片压缩:把照片精确压到目标 KB(如「不超过 30KB」「10–30KB 之间」),批量处理、EXIF 方向自动保留、最长边像素限制(如 1280 或 600×600 的 600)。报名系统、小程序上传、签证表的 KB 限制一次解决。**[立即使用](https://w1977-0.github.io/exactkb/)**
>
> **English** — Free image compressor with an exact-KB target: registration forms cap uploads at "30KB max" or "10–300KB" — this walks a quality bisection against the real encoder and hands you the largest file that fits, or tells you honestly why it can't (with a suggested pixel cap). Batch, EXIF-orientation safe. **[Try it](https://w1977-0.github.io/exactkb/)**
>
> **日本語** — 画像を指定KBに正確に圧縮する無料ツール。アップロード不要・ウォーターマークなし、ブラウザ内だけで動作。**[使ってみる](https://w1977-0.github.io/exactkb/)**

## Why

Upload forms don't want "quality 80%". They want **bytes**: "≤30KB", "between 10 and 300KB". Every "compress image" site guesses a quality and hopes — this one binary-searches the JPEG quality parameter (9 rounds ≈ 0.002 precision) against the **real encoder** and takes the largest result under the cap:

- fits → done, zero wasted headroom
- even the lowest quality overflows → **honest error with a suggested longest-edge cap** (never pads bytes into a JPEG)
- below a minimum-KB floor → reported, never faked

Privacy: the page makes zero network requests after load; your photos never leave the device.

## Details that matter

- **EXIF orientation preserved** — phone photos store rotation in EXIF; naive re-encoding ships sideways signatures. The orientation tag is parsed and applied.
- **Pixel + KB double cap** — many forms demand both (e.g. 600×600 AND ≤240KB). Set both once, batch everything.
- **Batch** — drop twenty files, get twenty downloads with per-file stats (before → after, size and dimensions, chosen quality).
- **Even-dimension rounding** — avoids odd-pixel chroma shifts in 4:2:0 encoders.

## How it works

```
decode → EXIF orientation applied → longest-edge fit (high-quality resample)
      → JPEG quality bisection vs the real encoder (9 rounds)
      → largest-fit result · honest unreachable/under-min reports
```

`kbmath.js` is the pure-function core (dual-environment); `test/kbmath.test.js` pins it with Node's built-in runner:

```
node --test test/kbmath.test.js
```

## Browser support

Any current Chrome, Edge, Firefox or Safari — desktop or mobile. Encoding goes through the browser's own canvas and JPEG encoder, so results can differ by a few hundred bytes between browsers; that is why the search measures the real encoder instead of predicting a size. Large batches are processed one file at a time, so very old or memory-limited devices may simply be slow.

## What it does not do

- **No byte padding.** If the cap is unreachable at the lowest usable quality, you get that as an answer with a suggested pixel cap — the tool never appends junk bytes to make a number look right.
- **No re-encoding to a different format.** Output is JPEG. PNG sources are read, not output as PNG.
- **No EXIF rewriting.** Orientation is read and applied so photos are not sideways; nothing else from the metadata block is carried into the output.

## License

MIT
