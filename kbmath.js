// kbmath.js — exactkb core math. Zero dependencies, browser + Node.
//
// The job: registration systems and chat-app uploads demand BOTH pixel caps
// and file-size caps ("300KB max", "between 10KB and 30KB"). The tool walks
// a deterministic ladder:
//
//   1. normalize  — decode, apply EXIF orientation, cap longest edge to the
//                   pixel limit (if any) by high-quality downsampling
//   2. bisect     — binary-search the JPEG quality parameter (9 rounds ≈
//                   0.002 quality precision) for the LARGEST file that still
//                   fits under the KB cap, using the real encoder
//   3. verify     — honest terminal states: ok / under-min / unreachable
//                   (never pad bytes into a JPEG; never lie)

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.kbmath = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---- pixel normalization ---------------------------------------------
  // Fit an image of (w,h) into a longest-edge cap. Returns the target dims
  // (unchanged when already within the cap). Pure math.
  function fitLongestEdge(w, h, cap) {
    if (!cap || cap <= 0) return { w: w, h: h };
    var longest = Math.max(w, h);
    if (longest <= cap) return { w: w, h: h };
    var s = cap / longest;
    // even dims avoid odd-pixel chroma shifts in 4:2:0 encoders
    return { w: Math.max(1, 2 * Math.round(w * s / 2)), h: Math.max(1, 2 * Math.round(h * s / 2)) };
  }

  // EXIF orientation normalizer: given the EXIF orientation code (1..8)
  // and the decoded bitmap dims, return the dims the canvas must have after
  // applying the rotation. (The caller rotates via canvas transform.)
  // Codes: 1 normal · 2 mirror · 3 rotate180 · 4 mirror180 · 5 mirror+90 ·
  //        6 rotate90 · 7 mirror-90 · 8 rotate-90
  function dimsAfterOrientation(w, h, orientation) {
    if (orientation >= 5 && orientation <= 8) return { w: h, h: w };
    return { w: w, h: h };
  }

  // Parse the EXIF orientation from a JPEG ArrayBuffer (0 when absent/other
  // formats). Pure bytes: scan APP1/Exif for the orientation tag (0x0112).
  function exifOrientation(arrayBuffer) {
    var u = new DataView(arrayBuffer);
    if (u.byteLength < 4 || u.getUint16(0) !== 0xFFD8) return 0; // not JPEG
    var off = 2;
    while (off + 4 <= u.byteLength) {
      var marker = u.getUint16(off);
      if ((marker & 0xFF00) !== 0xFF00) return 0;
      var size = u.getUint16(off + 2);
      if (marker === 0xFFE1) {
        // APP1: check "Exif\0\0"
        if (off + 10 <= u.byteLength &&
            u.getUint32(off + 4) === 0x45786966 && u.getUint16(off + 8) === 0x0000) {
          var tiff = off + 10;
          var le = u.getUint16(tiff) === 0x4949; // "II" little endian
          var read16 = function (p) { return u.getUint16(p, le); };
          var read32 = function (p) { return u.getUint32(p, le); };
          var ifd0 = tiff + read32(tiff + 4);
          var count = read16(ifd0);
          for (var i = 0; i < count; i++) {
            var e = ifd0 + 2 + i * 12;
            if (read16(e) === 0x0112) return read16(e + 8);
          }
          return 1;
        }
      }
      off += 2 + size;
    }
    return 0;
  }

  // ---- exact-KB bisection (encoder-driven, from idphoto-kit's proven core) --
  // bytesAt(quality) → byte size of the real encoded JPEG at that quality.
  // Returns {ok, quality, bytes, reason?} — reason ∈ {unreachable, under-min}.
  function bisectExactKB(maxKB, minKB, bytesAt) {
    var maxBytes = maxKB > 0 ? maxKB * 1024 : Infinity;
    var minBytes = minKB > 0 ? minKB * 1024 : 0;
    var lo = 0.05, hi = 1.0, best = null;
    for (var i = 0; i < 9; i++) {
      var mid = (lo + hi) / 2;
      var bytes = bytesAt(mid);
      if (bytes <= maxBytes) { best = { quality: mid, bytes: bytes }; lo = mid; }
      else hi = mid;
    }
    if (best === null) {
      var floorBytes = bytesAt(lo);
      if (floorBytes <= maxBytes) best = { quality: lo, bytes: floorBytes };
      else return { ok: false, reason: "unreachable", quality: lo, bytes: floorBytes };
    }
    if (best.bytes < minBytes) {
      return { ok: false, reason: "under-min", quality: best.quality, bytes: best.bytes };
    }
    return { ok: true, quality: best.quality, bytes: best.bytes };
  }

  // ---- human formatting -------------------------------------------------
  function fmtKB(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1048576).toFixed(2) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
    return bytes + " B";
  }

  // Downscale ladder recommendation: when a cap is unreachable even at the
  // lowest quality, suggest the longest-edge cap that usually makes it fit
  // (JPEG area scales roughly with pixel count).
  function suggestEdgeForCap(curW, curH, targetKB, actualBytesAtFull) {
    if (actualBytesAtFull <= 0 || targetKB <= 0) return null;
    var ratio = targetKB * 1024 / actualBytesAtFull; // ≤1
    if (ratio >= 1) return null;
    var s = Math.sqrt(ratio) * 0.92; // safety margin for encoder variance
    var longest = Math.max(curW, curH) * s;
    return Math.max(320, 2 * Math.round(longest / 2));
  }

  return {
    fitLongestEdge: fitLongestEdge,
    dimsAfterOrientation: dimsAfterOrientation,
    exifOrientation: exifOrientation,
    bisectExactKB: bisectExactKB,
    fmtKB: fmtKB,
    suggestEdgeForCap: suggestEdgeForCap
  };
});
