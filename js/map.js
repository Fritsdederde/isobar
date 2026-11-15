/* Isobar — de levende weerkaart: isobaren, hoge- en lagedrukgebieden, stroming langs de lijnen */
'use strict';
var W = window.W || (window.W = {});
(function () {
  var U = 6; // verfijning van het rooster
  var CITIES = [['Londen', 51.51, -0.13], ['Parijs', 48.86, 2.35], ['Berlijn', 52.52, 13.4], ['Oslo', 59.91, 10.75],
    ['Dublin', 53.35, -6.26], ['Kopenhagen', 55.68, 12.57], ['München', 48.14, 11.58], ['Edinburgh', 55.95, -3.19],
    ['Bordeaux', 44.84, -0.58], ['Stockholm', 59.33, 18.07], ['Milaan', 45.46, 9.19], ['Bergen', 60.39, 5.32]];

  var cv, ctx, wash, wctx, press = null, center = { lat: 51.82, lon: 4.64 };
  var Wd = 0, Hd = 0, dpr = 1;
  var target = Date.now(), cur = Date.now(), computedAt = -1e18, phase = 0, lastFrame = 0;
  var chains = [], marks = [], fw = 0, fh = 0, showCities = false, running = false, landCv = null;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    Wd = window.innerWidth; Hd = window.innerHeight;
    cv.width = Math.round(Wd * dpr); cv.height = Math.round(Hd * dpr);
    cv.style.width = Wd + 'px'; cv.style.height = Hd + 'px';
    computedAt = -1e18; landCv = null;
  }

  /* projectie: het eigen punt staat iets boven het midden */
  function proj() {
    var G = W.GRID, cosc = Math.cos(center.lat * Math.PI / 180);
    var s = Math.max(Hd / 24, Wd / (40 * cosc));
    return {
      x: function (lon) { return Wd * 0.5 + (lon - center.lon) * cosc * s; },
      y: function (lat) { return Hd * 0.42 - (lat - center.lat) * s; },
      // fijn rooster (gx naar rechts, gy naar beneden; rij 0 = noord)
      gx: function (gx) { return Wd * 0.5 + (G.lon0 + gx * G.dlon / U - center.lon) * cosc * s; },
      gy: function (gy) { return Hd * 0.42 - (G.lat0 + (G.ny - 1) * G.dlat - gy * G.dlat / U - center.lat) * s; }
    };
  }

  /* landkaart: één keer tekenen op een eigen laag, daarna alleen nog kopiëren */
  function drawLand() {
    var G = W.GEO; if (!G) return;
    landCv = document.createElement('canvas'); landCv.width = cv.width; landCv.height = cv.height;
    var c = landCv.getContext('2d'), P = proj();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    function poly(a) { c.moveTo(P.x(a[0]), P.y(a[1])); for (var i = 2; i < a.length; i += 2) c.lineTo(P.x(a[i]), P.y(a[i + 1])); }
    c.beginPath(); G.land.forEach(function (a) { poly(a); c.closePath(); });
    c.fillStyle = 'rgba(190,210,235,0.075)'; c.fill();
    c.lineJoin = 'round';
    c.beginPath(); G.border.forEach(poly); c.strokeStyle = 'rgba(190,210,235,0.13)'; c.lineWidth = 0.7; c.stroke();
    c.beginPath(); G.coast.forEach(poly); c.strokeStyle = 'rgba(205,225,248,0.42)'; c.lineWidth = 1; c.stroke();
  }

  function coarseAt(t) {
    var G = W.GRID, np = G.nx * G.ny;
    var f = Math.max(0, Math.min(press.n - 1, (t - press.t0) / press.step));
    var a = Math.floor(f), b = Math.min(press.n - 1, a + 1), k = f - a, out = new Float32Array(np);
    for (var i = 0; i < np; i++) out[i] = (press.d[a * np + i] * (1 - k) + press.d[b * np + i] * k) / 10;
    return out;
  }
  function cr(p0, p1, p2, p3, t) { // Catmull-Rom
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }
  function refine(c) {
    var G = W.GRID, nx = G.nx, ny = G.ny;
    fw = (nx - 1) * U + 1; fh = (ny - 1) * U + 1;
    var f = new Float32Array(fw * fh), row = new Float32Array(4);
    function at(x, y) { x = x < 0 ? 0 : x >= nx ? nx - 1 : x; y = y < 0 ? 0 : y >= ny ? ny - 1 : y; return c[y * nx + x]; }
    for (var gy = 0; gy < fh; gy++) {
      var yy = (fh - 1 - gy) / U, y1 = Math.floor(yy), ty = yy - y1; // rij 0 = noord
      for (var gx = 0; gx < fw; gx++) {
        var xx = gx / U, x1 = Math.floor(xx), tx = xx - x1;
        for (var r = 0; r < 4; r++) row[r] = cr(at(x1 - 1, y1 - 1 + r), at(x1, y1 - 1 + r), at(x1 + 1, y1 - 1 + r), at(x1 + 2, y1 - 1 + r), tx);
        f[gy * fw + gx] = cr(row[0], row[1], row[2], row[3], ty);
      }
    }
    return f;
  }

  /* isolijnen: marching squares, daarna aaneenrijgen tot lijnen met vaste richting (lage druk links) */
  function contours(f, level) {
    var segs = [], next = {}, hasPrev = {};
    function ip(a, b) { return (level - a) / (b - a); }
    for (var y = 0; y < fh - 1; y++) for (var x = 0; x < fw - 1; x++) {
      var i = y * fw + x, a = f[i], b = f[i + 1], c = f[i + fw + 1], d = f[i + fw];
      var code = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (c > level ? 2 : 0) | (d > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      var T = function () { return ['h' + x + ',' + y, x + ip(a, b), y]; };
      var R = function () { return ['v' + (x + 1) + ',' + y, x + 1, y + ip(b, c)]; };
      var B = function () { return ['h' + x + ',' + (y + 1), x + ip(d, c), y + 1]; };
      var L = function () { return ['v' + x + ',' + y, x, y + ip(a, d)]; };
      var pairs;
      switch (code) {
        case 1: case 14: pairs = [[L, B]]; break;
        case 2: case 13: pairs = [[B, R]]; break;
        case 3: case 12: pairs = [[L, R]]; break;
        case 4: case 11: pairs = [[T, R]]; break;
        case 6: case 9: pairs = [[T, B]]; break;
        case 7: case 8: pairs = [[L, T]]; break;
        case 5: pairs = (a + b + c + d) / 4 > level ? [[L, T], [B, R]] : [[L, B], [T, R]]; break;
        default: pairs = (a + b + c + d) / 4 > level ? [[L, B], [T, R]] : [[L, T], [B, R]];
      }
      for (var p = 0; p < pairs.length; p++) {
        var s = pairs[p][0](), e = pairs[p][1]();
        // waarde links van het lijnstukje (scherm: links van (dx,dy) is (dy,-dx))
        var dx = e[1] - s[1], dy = e[2] - s[2], mx = (s[1] + e[1]) / 2 + dy * 0.3, my = (s[2] + e[2]) / 2 - dx * 0.3;
        var qx = Math.max(0, Math.min(fw - 1.001, mx)), qy = Math.max(0, Math.min(fh - 1.001, my));
        var x0 = Math.floor(qx), y0 = Math.floor(qy), ux = qx - x0, uy = qy - y0, k = y0 * fw + x0;
        var val = f[k] * (1 - ux) * (1 - uy) + f[k + 1] * ux * (1 - uy) + f[k + fw] * (1 - ux) * uy + f[k + fw + 1] * ux * uy;
        if (val > level) { var tmp = s; s = e; e = tmp; }
        var seg = { s: s, e: e, used: false };
        segs.push(seg); next[s[0]] = seg; hasPrev[e[0]] = true;
      }
    }
    var out = [];
    function walk(seg) {
      var pts = [seg.s[1], seg.s[2]];
      while (seg && !seg.used) { seg.used = true; pts.push(seg.e[1], seg.e[2]); seg = next[seg.e[0]]; }
      if (pts.length >= 8) out.push(pts);
    }
    segs.forEach(function (s) { if (!hasPrev[s.s[0]]) walk(s); });
    segs.forEach(function (s) { if (!s.used) walk(s); });
    return out;
  }

  function compute(t) {
    var f = refine(coarseAt(t)), lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < f.length; i++) { if (f[i] < lo) lo = f[i]; if (f[i] > hi) hi = f[i]; }
    chains = [];
    for (var lv = Math.ceil(lo / 4) * 4; lv < hi; lv += 4) {
      contours(f, lv).forEach(function (pts) { chains.push({ lv: lv, pts: pts }); });
    }
    // kernen van hoge en lage druk
    marks = [];
    var R = 7;
    for (var y = 2; y < fh - 2; y++) for (var x = 2; x < fw - 2; x++) {
      var v = f[y * fw + x], mx = true, mn = true;
      for (var yy = Math.max(0, y - R); yy <= Math.min(fh - 1, y + R) && (mx || mn); yy++)
        for (var xx = Math.max(0, x - R); xx <= Math.min(fw - 1, x + R); xx++) {
          var q = f[yy * fw + xx];
          if (q > v) mx = false; if (q < v) mn = false;
        }
      if (mx && v > 1015) marks.push({ x: x, y: y, v: v, hi: true });
      else if (mn && v < 1012) marks.push({ x: x, y: y, v: v, hi: false });
    }
    // kleurwaas: blauw bij lage druk, amber bij hoge druk
    if (!wash || wash.width !== fw) { wash = document.createElement('canvas'); wash.width = fw; wash.height = fh; wctx = wash.getContext('2d'); }
    var img = wctx.createImageData(fw, fh), d = img.data;
    for (i = 0; i < f.length; i++) {
      var a = Math.max(-1, Math.min(1, (f[i] - 1013) / 24)), o = i * 4;
      if (a < 0) { d[o] = 60; d[o + 1] = 140; d[o + 2] = 255; } else { d[o] = 245; d[o + 1] = 150; d[o + 2] = 40; }
      d[o + 3] = Math.round(Math.pow(Math.abs(a), 1.3) * 78);
    }
    wctx.putImageData(img, 0, 0);
    computedAt = t;
  }

  function trace(P, pts) {
    ctx.beginPath();
    ctx.moveTo(P.gx(pts[0]), P.gy(pts[1]));
    for (var i = 2; i < pts.length - 2; i += 2) {
      var x = P.gx(pts[i]), y = P.gy(pts[i + 1]), nx = P.gx(pts[i + 2]), ny = P.gy(pts[i + 3]);
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    ctx.lineTo(P.gx(pts[pts.length - 2]), P.gy(pts[pts.length - 1]));
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, Hd);
    g.addColorStop(0, '#0B1626'); g.addColorStop(1, '#070E19');
    ctx.fillStyle = g; ctx.fillRect(0, 0, Wd, Hd);
    if (!landCv) drawLand();
    if (landCv) ctx.drawImage(landCv, 0, 0, Wd, Hd);
    if (!press) return;
    var P = proj();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(wash, 0.5, 0.5, fw - 1, fh - 1, P.gx(0), P.gy(0), P.gx(fw - 1) - P.gx(0), P.gy(fh - 1) - P.gy(0));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var c, i;
    for (i = 0; i < chains.length; i++) {
      c = chains[i];
      var major = c.lv % 20 === 0;
      trace(P, c.pts);
      ctx.setLineDash([]);
      ctx.strokeStyle = major ? 'rgba(160,205,255,0.30)' : 'rgba(140,190,250,0.17)';
      ctx.lineWidth = major ? 1.4 : 1;
      ctx.stroke();
      // stroming: lichtpuntjes die met de wind meebewegen (rond een lagedrukgebied tegen de klok in)
      ctx.setLineDash([1.5, 26]);
      ctx.lineDashOffset = -phase;
      ctx.strokeStyle = 'rgba(200,228,255,0.55)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // waarden langs de lijnen
    ctx.font = '500 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < chains.length; i++) {
      c = chains[i];
      if (c.lv % 8 !== 0 || c.pts.length < 60) continue;
      var m = Math.floor(c.pts.length / 4) * 2, lx = P.gx(c.pts[m]), ly = P.gy(c.pts[m + 1]);
      if (lx < 20 || lx > Wd - 20 || ly < 20 || ly > Hd - 20) continue;
      ctx.fillStyle = 'rgba(170,200,235,0.5)'; ctx.fillText(String(c.lv), lx, ly - 7);
    }
    for (i = 0; i < marks.length; i++) {
      var mk = marks[i], x = P.gx(mk.x), y = P.gy(mk.y);
      if (x < -30 || x > Wd + 30 || y < -30 || y > Hd + 30) continue;
      ctx.fillStyle = mk.hi ? 'rgba(255,196,110,0.5)' : 'rgba(140,195,255,0.55)';
      ctx.font = '600 38px "Space Grotesk", system-ui, sans-serif';
      ctx.fillText(mk.hi ? 'H' : 'L', x, y);
      ctx.font = '500 11px Inter, system-ui, sans-serif';
      ctx.fillText(Math.round(mk.v) + ' hPa', x, y + 26);
    }
    if (showCities) {
      ctx.font = '500 11px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
      CITIES.forEach(function (ct) {
        var x = P.x(ct[2]), y = P.y(ct[1]);
        if (Math.abs(x - Wd / 2) < 40 && Math.abs(y - Hd * 0.42) < 24) return;
        ctx.fillStyle = 'rgba(242,246,251,0.55)';
        ctx.beginPath(); ctx.arc(x, y, 2, 0, 6.3); ctx.fill();
        ctx.fillText(ct[0], x + 6, y);
      });
      ctx.textAlign = 'center';
    }
    // eigen plek
    var px = Wd / 2, py = Hd * 0.42, pulse = (phase % 60) / 60;
    ctx.strokeStyle = 'rgba(245,165,36,' + (0.5 * (1 - pulse)) + ')'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 4 + pulse * 14, 0, 6.3); ctx.stroke();
    ctx.fillStyle = '#F5A524'; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 6.3); ctx.fill();
  }

  function frame(ts) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (ts - lastFrame < 30) return; // ±30 beelden per seconde is genoeg
    var dt = Math.min(100, ts - lastFrame); lastFrame = ts;
    if (!reduce) phase += dt * 0.012;
    var diff = target - cur;
    cur = Math.abs(diff) < 60e3 ? target : cur + diff * 0.18;
    if (press && Math.abs(cur - computedAt) > 4 * 60e3) compute(cur);
    draw();
  }
  function start() { if (!running) { running = true; lastFrame = 0; requestAnimationFrame(frame); } }

  W.map = {
    init: function (canvas) {
      cv = canvas; ctx = cv.getContext('2d'); resize();
      window.addEventListener('resize', resize);
      document.addEventListener('visibilitychange', function () { if (document.hidden) running = false; else start(); });
      start();
    },
    setData: function (p) { press = p; computedAt = -1e18; },
    setCenter: function (lat, lon) { center = { lat: lat, lon: lon }; landCv = null; },
    setTime: function (utc, snap) { target = utc; if (snap) cur = utc; },
    setCities: function (on) { showCities = on; },
    range: function () { return press ? [press.t0, press.t0 + (press.n - 1) * press.step] : null; }
  };
})();
