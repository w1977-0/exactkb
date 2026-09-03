// test/kbmath.test.js — exactkb math tests (Node built-in runner).
//   node --test test/kbmath.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const m = require(path.join(__dirname, "..", "kbmath.js"));

// ---- pixel normalization -------------------------------------------------

test("fitLongestEdge: caps the longest side, keeps aspect, even dims", () => {
  let r = m.fitLongestEdge(4000, 3000, 1280);
  assert.equal(r.w, 1280);
  assert.ok(Math.abs(r.h - 960) <= 1, "aspect kept: " + r.h);
  assert.equal(r.h % 2, 0, "even height");

  r = m.fitLongestEdge(3000, 4000, 1280); // portrait
  assert.equal(r.h, 1280);
  assert.ok(Math.abs(r.w - 960) <= 1);

  r = m.fitLongestEdge(1000, 800, 1280);  // already inside
  assert.deepEqual(r, { w: 1000, h: 800 });

  r = m.fitLongestEdge(1000, 800, 0);     // cap disabled
  assert.deepEqual(r, { w: 1000, h: 800 });

  r = m.fitLongestEdge(1, 1, 1280);       // degenerate floor
  assert.deepEqual(r, { w: 1, h: 1 });
});

test("fitLongestEdge: odd source dims round to even, never 0", () => {
  const r = m.fitLongestEdge(999, 500, 100);
  assert.ok(r.w >= 1 && r.h >= 1);
  assert.equal(r.w % 2, 0); // 999 → ~100 stays even after rounding
});

// ---- EXIF ------------------------------------------------------------------

test("exifOrientation: recognizes orientation 6 (rotate90) and 1 (normal)", () => {
  // Build a minimal JPEG APP1/Exif blob with the orientation tag.
  function jpegWithOrientation(orient) {
    const tiff = Buffer.alloc(8); tiff.write("II", 0, "latin1"); // little endian
    tiff.writeUInt16LE(0x2A, 2); tiff.writeUInt32LE(8, 4);        // IFD0 at +8
    const ifd = Buffer.alloc(2 + 12 + 4);
    ifd.writeUInt16LE(1, 0);                                      // 1 entry
    ifd.writeUInt16LE(0x0112, 2);                                 // tag
    ifd.writeUInt16LE(3, 4);                                      // type SHORT
    ifd.writeUInt32LE(1, 6);                                      // count
    ifd.writeUInt16LE(orient, 10);                                // value
    ifd.writeUInt32LE(0, 14);                                     // next IFD
    const app1 = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff, ifd]);
    const seg = Buffer.alloc(4);
    seg.writeUInt16BE(0xFFE1, 0); seg.writeUInt16BE(app1.length + 2, 2);
    return Buffer.concat([Buffer.from([0xFF, 0xD8]), seg, app1]);
  }
  assert.equal(m.exifOrientation(Uint8Array.from(jpegWithOrientation(6)).buffer), 6);
  assert.equal(m.exifOrientation(Uint8Array.from(jpegWithOrientation(1)).buffer), 1);
  assert.equal(m.exifOrientation(Uint8Array.from(jpegWithOrientation(8)).buffer), 8);
  // no EXIF at all → 0
  const bare = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00]);
  assert.equal(m.exifOrientation(Uint8Array.from(bare).buffer), 0);
  // not a JPEG → 0
  assert.equal(m.exifOrientation(new Uint8Array([0x89, 0x50]).buffer), 0);
});

test("dimsAfterOrientation: swaps dims for orientations 5-8", () => {
  assert.deepEqual(m.dimsAfterOrientation(4000, 3000, 6), { w: 3000, h: 4000 });
  assert.deepEqual(m.dimsAfterOrientation(4000, 3000, 8), { w: 3000, h: 4000 });
  assert.deepEqual(m.dimsAfterOrientation(4000, 3000, 5), { w: 3000, h: 4000 });
  assert.deepEqual(m.dimsAfterOrientation(4000, 3000, 1), { w: 4000, h: 3000 });
  assert.deepEqual(m.dimsAfterOrientation(4000, 3000, 3), { w: 4000, h: 3000 });
});

// ---- exact-KB bisection ----------------------------------------------------

test("bisectExactKB: largest quality that fits, near-optimal", () => {
  // realistic 295x413-ish response: 4KB@0.4 rising to ~56KB@1.0
  const bytesAt = q => Math.round(4096 * Math.pow(9, (q - 0.4) / 0.5));
  const capKB = 30;
  const r = m.bisectExactKB(capKB, 0, bytesAt);
  assert.equal(r.ok, true);
  assert.ok(r.bytes <= capKB * 1024);
  const gap = 0.95 / 512; // final bisection resolution
  assert.ok(bytesAt(Math.min(1, r.quality + gap)) > capKB * 1024, "no wasted headroom");
});

test("bisectExactKB: unreachable cap reported honestly", () => {
  const bytesAt = () => 5 * 1024 * 1024; // 5MB at every quality
  const r = m.bisectExactKB(30, 0, bytesAt);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unreachable");
});

test("bisectExactKB: under-min detected, never faked", () => {
  const bytesAt = q => Math.round(500 * Math.pow(1.4, q - 1)); // ~500B max
  const r = m.bisectExactKB(30, 10, bytesAt);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "under-min");
});

test("bisectExactKB: two-sided window (10KB-30KB) satisfied in-band", () => {
  // model that sweeps through the whole window: 1KB@0.4 → 90KB@1.0
  const bytesAt = q => Math.round(1024 * Math.pow(90, (q - 0.4) / 0.6));
  const r = m.bisectExactKB(30, 10, bytesAt);
  assert.equal(r.ok, true);
  assert.ok(r.bytes >= 10 * 1024 && r.bytes <= 30 * 1024, "in band: " + r.bytes);
});

// ---- helpers ----------------------------------------------------------------

test("fmtKB formats human units", () => {
  assert.equal(m.fmtKB(500), "500 B");
  assert.equal(m.fmtKB(30720), "30.0 KB");
  assert.equal(m.fmtKB(1048576 * 2.5), "2.50 MB");
});

test("suggestEdgeForCap: sqrt-area shrink with safety margin", () => {
  // 5MB actual, target 30KB → ratio ~0.00586 → sqrt ≈ 0.0765 → ×0.92
  const edge = m.suggestEdgeForCap(4000, 3000, 30, 5 * 1024 * 1024);
  assert.ok(edge >= 320, "floor at 320");
  assert.ok(edge <= 4 * 1024, "shrunk meaningfully");
  // already fits → no suggestion
  assert.equal(m.suggestEdgeForCap(4000, 3000, 30, 20 * 1024), null);
  // degenerate → null
  assert.equal(m.suggestEdgeForCap(0, 0, 0, 0), null);
});
