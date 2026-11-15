/* Isobar — schermen: één tijdlijn van een maand terug tot zes weken vooruit */
'use strict';
var W = window.W || (window.W = {});
(function () {
  var HOUR = W.HOUR, DAY = W.DAY, F = W.fmt;
  var $ = function (id) { return document.getElementById(id); };
  var ui = { actDay: null, act: W.lsGet('act') || 'fiets', scrolled: false, mapMode: false, playing: null };
  var CONF = ['lopen uiteen', 'redelijk eens', 'zijn het eens'];

  /* ---------- iconen ---------- */
  var CL = '<path d="M7 15.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 7 4.3 4.3 0 0 0 7 15.5z"/>';
  var IC = {
    sun: '<g class="am"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></g>',
    moon: '<path class="am" d="M19.5 14.5A8 8 0 0 1 9.5 4.5a7 7 0 1 0 10 10z"/>',
    cloud: '<g transform="translate(0,2.5)">' + CL + '</g>',
    partly: '<g class="am"><circle cx="8.5" cy="8" r="3"/><path d="M8.5 2.4v1.3M2.9 8h1.3M4.5 4l.9.9M12.5 4l-.9.9"/></g><g class="occ" transform="translate(3.6,6.2) scale(.85)">' + CL + '</g>',
    'partly-n': '<path class="am" d="M12.6 2.8a5 5 0 1 0 6.6 6.6 4.2 4.2 0 0 1-6.6-6.6z"/><g class="occ" transform="translate(1.5,6.2) scale(.85)">' + CL + '</g>',
    drizzle: CL + '<path class="bl" d="M9.5 18.6v1.6M14.5 18.6v1.6"/>',
    rain: CL + '<path class="bl" d="M8 18.6v2.4M12 18.6v3.4M16 18.6v2.4"/>',
    shower: CL + '<path class="bl" d="M8.6 18.2l-1.2 3.4M12.6 18.2l-1.3 4M16.6 18.2l-1.2 3.4"/>',
    snow: CL + '<g class="bl"><path d="M8.5 19.5h.01M12 21.5h.01M15.5 19.5h.01" stroke-width="2.6"/></g>',
    thunder: CL + '<path class="am" d="M12.8 16.6l-2.3 3.2h3l-2 3.2"/>',
    fog: '<path d="M4 9h16M6 13h12M4 17h16"/>'
  };
  function ico(k) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (IC[k] || IC.cloud) + '</svg>'; }
  function arrow(dir, cls) { // pijl wijst waar de wind naartoe waait
    return '<svg class="arr ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(' + Math.round((dir + 180) % 360) + 'deg)"><path d="M12 20V5M6.5 10.5 12 5l5.5 5.5"/></svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nowP(S) { return Date.now() + (S.off || 0); }
  function path(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(''); }
  function bftC(kmh) { return Math.pow(Math.max(0, kmh) / 3.01, 2 / 3); }

  /* ---------- NU ---------- */
  function renderNu(S) {
    var now = nowP(S), d0 = Math.floor(now / DAY) * DAY;
    var past = S.hours.filter(function (h) { return h.t <= now; }), cur = past[past.length - 1] || S.hours[0];
    var today = S.days.filter(function (d) { return d.t === d0; })[0] || S.days[0];
    var kd = W.kind(cur, W.isNight(S, now)), conf = today.conf;
    var h = '<div class="hero">' +
      '<div class="date">' + cap(F.datumL(now)) + '</div>' +
      '<div class="big" style="filter:blur(' + ((2 - conf) * 0.5) + 'px)">' + Math.round(cur.temp) + '<span>°</span></div>' +
      '<div class="cond">' + ico(kd[0]) + kd[1] + '</div>' +
      '<div class="sub">Voelt als ' + Math.round(cur.feel == null ? cur.temp : cur.feel) + '° · wind ' + W.compass(cur.dir || 0) + ' ' + W.bft(cur.wind) + ' Bft · vandaag ' + Math.round(today.tmin) + '° / ' + Math.round(today.tmax) + '°</div>' +
      '<div class="pill c' + conf + '"><i></i>Gemiddelde van ' + cur.n + ' modellen · ze ' + CONF[conf] + '</div></div>';

    h += '<div class="card"><div class="eyebrow">Weerpraatje<span>' + F.uur(S.updated + S.off) + '</span></div><p class="talk">' + esc(W.praatje(S)) + '</p></div>';

    // regen komende 2 uur (per kwartier)
    if (S.nowcast) {
      var nc = [], i;
      for (i = 0; i < S.nowcast.t.length; i++) if (S.nowcast.t[i] > now - 15 * 60e3 && nc.length < 8) nc.push({ t: S.nowcast.t[i], r: S.nowcast.r[i] || 0 });
      if (nc.length >= 4) {
        var mx = Math.max(1, Math.max.apply(null, nc.map(function (x) { return x.r; })));
        var wet = nc.filter(function (x) { return x.r >= 0.05; }), kop;
        if (!wet.length) kop = 'Droog';
        else if (nc[0].r < 0.05) kop = 'Regen vanaf ' + F.uur(wet[0].t);
        else { var dry = nc.filter(function (x) { return x.r < 0.05; })[0]; kop = dry ? 'Droog vanaf ' + F.uur(dry.t) : 'Het blijft regenen'; }
        h += '<div class="card"><div class="ctitle">Regen komende 2 uur<span class="blue">' + kop + '</span></div><div class="nowc">' +
          nc.map(function (x) { return '<i style="height:' + Math.max(3, x.r / mx * 100) + '%;opacity:' + (x.r >= 0.05 ? 1 : 0.25) + '"></i>'; }).join('') +
          '</div><div class="axis"><span>nu</span><span>+1 uur</span><span>+2 uur</span></div></div>';
      }
    }
    // per uur
    var hs = S.hours.filter(function (x) { return x.t > now - HOUR; }).slice(0, 48);
    h += '<div class="card nopad"><div class="ctitle pad">Per uur<span>veeg opzij: de kaart beweegt mee</span></div><div class="hstrip" id="hstrip">' +
      hs.map(function (x, n) {
        var k = W.kind(x, W.isNight(S, x.t + HOUR / 2)), u = new Date(x.t).getUTCHours();
        return '<div class="hc' + (n === 0 ? ' on' : '') + '" data-t="' + x.t + '"><span class="ht">' + (n === 0 ? 'Nu' : u === 0 ? F.dag(x.t) : u + 'u') + '</span>' + ico(k[0]) +
          '<b>' + Math.round(x.temp) + '°</b><span class="hr">' + (x.rain >= 0.1 ? F.mm(x.rain) + ' mm' : '&nbsp;') + '</span><span class="hw">' + arrow(x.dir || 0) + W.bft(x.wind) + '</span></div>';
      }).join('') + '</div></div>';
    h += '<div id="buiten"></div>';
    $('s-nu').innerHTML = h;
    renderBuiten(S);
  }

  function renderBuiten(S) {
    var now = nowP(S), d0 = Math.floor(now / DAY) * DAY;
    var days = S.days.filter(function (d) { return d.t >= d0 && d.n >= 20 || d.t === d0; }).slice(0, 8);
    if (ui.actDay == null || !days.some(function (d) { return d.t === ui.actDay; })) ui.actDay = d0;
    var a = W.activiteit(S, ui.actDay, ui.act);
    var h = '<div class="card"><div class="ctitle">Buiten<span class="blue">' + esc(W.droog(S)) + '</span></div>' +
      '<div class="seg" role="tablist"><button data-act="fiets" class="' + (ui.act === 'fiets' ? 'on' : '') + '">Fietsen</button><button data-act="wandel" class="' + (ui.act === 'wandel' ? 'on' : '') + '">Wandelen</button><button data-act="mtb" class="' + (ui.act === 'mtb' ? 'on' : '') + '">MTB</button><button data-act="paard" class="' + (ui.act === 'paard' ? 'on' : '') + '">Paarden</button></div>' +
      '<div class="chips">' + days.map(function (d) {
        return '<button data-day="' + d.t + '" class="' + (d.t === ui.actDay ? 'on' : '') + '">' + (d.t === d0 ? 'vandaag' : F.dag(d.t) + ' ' + new Date(d.t).getUTCDate()) + '</button>';
      }).join('') + '</div>';
    if (a) {
      var sc = a.score, col = sc == null ? '#A9B8CC' : sc >= 7.5 ? '#5FD39A' : sc >= 5.5 ? '#F5A524' : '#F0736A';
      h += '<div class="act"><div class="score" style="color:' + col + ';border-color:' + col + '">' + (sc == null ? '–' : F.n1(sc)) + '</div><p class="talk">' + esc(a.text) + '</p></div>';
      if (a.facts.length) h += '<div class="facts">' + a.facts.map(function (f) { return '<div><span>' + f[0] + '</span><b>' + esc(f[1]) + '</b></div>'; }).join('') + '</div>';
    }
    $('buiten').innerHTML = h + '</div>';
  }

  /* ---------- 14 DAGEN ---------- */
  function render14(S) {
    var now = nowP(S), d0 = Math.floor(now / DAY) * DAY;
    var days = S.days.filter(function (d) { return d.t >= d0 && (d.n >= 18 || d.t === d0); }).slice(0, 14);
    var lo = Math.min.apply(null, days.map(function (d) { return d.minLo; })) - 1, hi = Math.max.apply(null, days.map(function (d) { return d.maxHi; })) + 1;
    var p = function (v) { return ((v - lo) / (hi - lo) * 100).toFixed(1); };
    var h = '<h2>14 dagen</h2><div class="card"><div class="legend"><span><i class="lg sharp"></i>strak: modellen eens</span><span><i class="lg soft"></i>wazig: onzeker</span></div>';
    h += days.map(function (d) {
      var k = W.dayKind(d), blur = Math.min(5, d.spread * 0.55), few = d.nMod <= 2;
      return '<div class="drow' + (d.t === d0 ? ' today' : '') + '" data-t="' + (d.t + 12 * HOUR) + '"><span class="dn">' + F.dag(d.t) + '<small>' + new Date(d.t).getUTCDate() + '</small></span>' +
        ico(k[0]) + '<span class="dr">' + (d.rain >= 0.1 ? F.mm(d.rain) + '<small>mm</small>' : '<small>droog</small>') + '</span>' +
        '<span class="dmin">' + Math.round(d.tmin) + '°</span><span class="bar"><i class="band" style="left:' + p(d.minLo) + '%;width:' + (p(d.maxHi) - p(d.minLo)).toFixed(1) + '%;filter:blur(' + (1 + blur) + 'px)"></i>' +
        '<i class="core" style="left:' + p(d.tmin) + '%;width:' + Math.max(3, p(d.tmax) - p(d.tmin)).toFixed(1) + '%;filter:blur(' + ((2 - d.conf) * 0.9 + (few ? 0.6 : 0)) + 'px);opacity:' + (few ? 0.7 : 1) + '"></i></span>' +
        '<span class="dmax">' + Math.round(d.tmax) + '°</span><span class="dw">' + arrow(d.dir || 0) + W.bft(d.wind) + '</span></div>';
    }).join('');
    $('s-14').innerHTML = h + '<p class="note">Regen in mm per dag, wind in Beaufort (hoogste uurgemiddelde). Na dag 10 rekenen nog maar twee modellen mee.</p></div>';
  }

  /* ---------- 6 WEKEN ---------- */
  function render6w(S) {
    var now = nowP(S), d0 = Math.floor(now / DAY) * DAY, C = S.clim;
    var days = S.long.days.filter(function (d) { return d.t >= d0; }).slice(0, 42), n = days.length, wk = W.weeks(S);
    if (n < 10) { $('s-6w').innerHTML = ''; return; }
    var VW = 340, L = 24, R = 6, x = function (i) { return L + i / (n - 1) * (VW - L - R); };
    var weekLines = '', xl = '';
    for (var i = 0; i < n; i += 7) {
      weekLines += '<line x1="' + x(i) + '" x2="' + x(i) + '" y1="4" y2="H" class="grid"/>';
      xl += '<span>' + F.datum(days[i].t) + '</span>';
    }
    function chart(H, lo, hi, step, unit, body) {
      var y = function (v) { return 6 + (hi - v) / (hi - lo) * (H - 12); }, g = '';
      for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) g += '<line x1="' + L + '" x2="' + (VW - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="grid"/><text x="0" y="' + (y(v) + 3.5) + '" class="ax">' + v + unit + '</text>';
      return '<svg viewBox="0 0 ' + VW + ' ' + H + '" class="chart" role="img">' + weekLines.replace(/H/g, H - 4) + g + body(y) + '</svg><div class="axis wk">' + xl + '</div>';
    }
    function band(y, a, b) {
      return path(days.map(function (d, i) { return [x(i), y(d[a])]; })) + path(days.slice().reverse().map(function (d, i) { return [x(n - 1 - i), y(d[b])]; })).replace('M', 'L') + 'Z';
    }
    var defs = '<defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity=".45"/></linearGradient>' +
      '<mask id="mfade"><rect width="' + VW + '" height="200" fill="url(#fade)"/></mask><filter id="soft" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>';

    var h = '<h2>Zes weken vooruit</h2><div class="card"><div class="eyebrow">De grote lijn<span>' + F.datum(days[0].t) + ' – ' + F.datum(days[n - 1].t) + '</span></div><p class="talk">' + esc(W.groteLijn(S)) + '</p></div>';

    // temperatuur
    var norm = C ? days.map(function (d) { return C.t[W.doy(d.t)]; }) : null;
    var all = days.map(function (d) { return d.t10; }).concat(days.map(function (d) { return d.t90; }), norm || []);
    var tlo = Math.floor(Math.min.apply(null, all) - 1), thi = Math.ceil(Math.max.apply(null, all) + 1);
    h += '<div class="card"><div class="ctitle">Temperatuur<span>daggemiddelde</span></div>' + chart(150, tlo, thi, 5, '°', function (y) {
      return defs + '<path d="' + band(y, 't90', 't10') + '" fill="#F5A524" fill-opacity=".26" filter="url(#soft)"/>' +
        (norm ? '<path d="' + path(norm.map(function (v, i) { return [x(i), y(v)]; })) + '" class="norm"/>' : '') +
        '<path d="' + path(days.map(function (d, i) { return [x(i), y(d.tm)]; })) + '" class="ln amber" mask="url(#mfade)"/>';
    }) + '<div class="legend"><span><i class="lg lnA"></i>verwachting</span><span><i class="lg soft"></i>spreiding</span>' + (norm ? '<span><i class="lg dash"></i>normaal</span>' : '') + '</div></div>';

    // neerslag
    var rmax = Math.max(4, Math.max.apply(null, days.map(function (d) { return d.r; })) * 1.15);
    h += '<div class="card"><div class="ctitle">Neerslag<span>verwachte mm per dag</span></div><div class="rbars">' +
      days.map(function (d, i) { return '<i style="height:' + Math.max(2, d.r / rmax * 100) + '%;opacity:' + (1 - i / n * 0.6).toFixed(2) + '"></i>'; }).join('') +
      '</div><div class="axis wk">' + xl + '</div><div class="wgrid">' + wk.map(function (w) {
        return '<div class="wchip b"><span>' + F.datum(w.t0) + '</span><b>' + Math.round(w.rain) + ' mm</b><span>' + (w.rn != null ? 'normaal ' + Math.round(w.rn) : '&nbsp;') + '</span></div>';
      }).join('') + '</div></div>';

    // wind
    var wall = days.map(function (d) { return bftC(d.w90); }), whi = Math.max(6, Math.ceil(Math.max.apply(null, wall)));
    h += '<div class="card"><div class="ctitle">Wind<span>daggemiddelde, Beaufort</span></div>' + chart(100, 0, whi, 2, '', function (y) {
      var bd = path(days.map(function (d, i) { return [x(i), y(bftC(d.w90))]; })) + path(days.slice().reverse().map(function (d, i) { return [x(n - 1 - i), y(bftC(d.w10))]; })).replace('M', 'L') + 'Z';
      return '<path d="' + bd + '" fill="#5FD39A" fill-opacity=".22" filter="url(#soft)"/><path d="' + path(days.map(function (d, i) { return [x(i), y(bftC(d.w))]; })) + '" class="ln green" mask="url(#mfade)"/>';
    }) + '<div class="wgrid">' + wk.map(function (w) {
      return '<div class="wchip g"><span>' + F.datum(w.t0) + '</span><b>' + arrow(w.dir, 'g') + W.compass(w.dir) + ' ' + Math.round(bftC(w.wind)) + '</b></div>';
    }).join('') + '</div><p class="note">Buien en windstoten vallen op deze termijn weg in het gemiddelde; zie het als trend.</p></div>';
    $('s-6w').innerHTML = h;
  }

  /* ---------- TERUG ---------- */
  function renderTerug(S) {
    var H = S.hist, now = nowP(S), d0 = Math.floor(now / DAY) * DAY, C = S.clim;
    var past = [];
    H.t.forEach(function (t, i) { if (t < d0 && H.rain[i] != null) past.push({ t: t, r: H.rain[i], tmax: H.tmax[i], tmin: H.tmin[i] }); });
    if (past.length < 7) { $('s-terug').innerHTML = ''; return; }
    var m28 = past.slice(-28), w7 = past.slice(-7);
    var sofar = S.hours ? S.hours.filter(function (h) { return h.t >= d0 && h.t + HOUR <= now; }).reduce(function (s, h) { return s + h.rain; }, 0) : null;
    var sum7 = w7.reduce(function (s, d) { return s + d.r; }, 0), sum28 = m28.reduce(function (s, d) { return s + d.r; }, 0);
    var n7 = C ? w7.reduce(function (s, d) { return s + C.r[W.doy(d.t)]; }, 0) : null;
    var n28 = C ? m28.reduce(function (s, d) { return s + C.r[W.doy(d.t)]; }, 0) : null;
    var ly = null;
    if (C && C.ly) {
      ly = 0;
      w7.forEach(function (d) { var x = new Date(d.t); x.setUTCFullYear(x.getUTCFullYear() - 1); var v = C.ly[x.toISOString().slice(0, 10)]; if (v == null) ly = NaN; else ly += v; });
      if (isNaN(ly)) ly = null;
    }
    var mx28 = Math.max(5, Math.max.apply(null, m28.map(function (d) { return d.r; })));
    var h = '<h2>Terugkijken</h2>';
    h += '<div class="card nopad"><div class="ctitle pad">Afgelopen 4 weken<span class="blue">' + F.mm(sum28) + ' mm' + (n28 != null ? ' · normaal ' + Math.round(n28) : '') + '</span></div><div class="mscroll" id="mscroll"><div class="mbars">' +
      m28.map(function (d) {
        return '<div class="mb" data-t="' + (d.t + 12 * HOUR) + '"><span>' + (d.r >= 0.1 ? F.mm(d.r) : '') + '</span><i style="height:' + Math.max(2, d.r / mx28 * 100) + '%" class="' + (d.r >= 0.1 ? '' : 'dry') + '"></i><small>' + F.dag(d.t) + '<br>' + new Date(d.t).getUTCDate() + '</small></div>';
      }).join('') + '</div></div></div>';

    var bars = w7.map(function (d) { return { l: F.dag(d.t), s: new Date(d.t).getUTCDate(), r: d.r, t: d.t + 12 * HOUR }; });
    if (sofar != null) bars.push({ l: 'nu', s: 'tot nu', r: sofar, t: now, part: true });
    var mx7 = Math.max(5, Math.max.apply(null, bars.map(function (b) { return b.r; })));
    h += '<div class="card"><div class="eyebrow">Gevallen regen · afgelopen 7 dagen</div><div class="tot"><div class="totn">' + F.mm(sum7) + '<span>mm</span></div><div class="totc">' +
      (n7 != null ? '<div><span>Normaal</span><b>' + Math.round(n7) + ' mm</b></div>' : '') + (ly != null ? '<div><span>Vorig jaar</span><b>' + F.mm(ly) + ' mm</b></div>' : '') + '</div></div><div class="wbars">' +
      bars.map(function (b) {
        return '<div class="wb' + (b.part ? ' part' : '') + '" data-t="' + b.t + '"><b>' + F.mm(b.r) + '</b><i style="height:' + Math.max(1.5, b.r / mx7 * 76) + '%" class="' + (b.r >= 0.1 ? '' : 'dry') + '"></i><span>' + b.l + '</span><small>' + b.s + '</small></div>';
      }).join('') + '</div><p class="note">Millimeters per dag volgens de modelanalyse voor deze plek, geen regenmeter. Bij lokale buien kan het afwijken.</p></div>';
    $('s-terug').innerHTML = h;
    var ms = $('mscroll'); ms.scrollLeft = ms.scrollWidth;
  }

  /* ---------- MODELLEN ---------- */
  function renderMod(S) {
    var now = nowP(S), hs = S.hours.filter(function (h) { return h.t >= now - HOUR && h.t < now + 120 * HOUR; }), n = hs.length;
    var VW = 340, Hh = 170, L = 24, R = 6, all = [];
    hs.forEach(function (h) { h.per.forEach(function (v) { if (v != null) all.push(v); }); });
    var lo = Math.floor(Math.min.apply(null, all) - 1), hi = Math.ceil(Math.max.apply(null, all) + 1);
    var x = function (i) { return L + i / (n - 1) * (VW - L - R); }, y = function (v) { return 6 + (hi - v) / (hi - lo) * (Hh - 12); };
    var g = '', xl = '';
    for (var v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) g += '<line x1="' + L + '" x2="' + (VW - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="grid"/><text x="0" y="' + (y(v) + 3.5) + '" class="ax">' + v + '°</text>';
    hs.forEach(function (h, i) { if (new Date(h.t).getUTCHours() === 0) { g += '<line x1="' + x(i) + '" x2="' + x(i) + '" y1="4" y2="' + (Hh - 4) + '" class="grid"/>'; xl += '<span style="left:' + (x(i) / VW * 100) + '%">' + F.dag(h.t) + '</span>'; } });
    var lines = W.MODELS.map(function (m, mi) {
      var d = '', pen = false;
      hs.forEach(function (h, i) { var val = h.per[mi]; if (val == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(val).toFixed(1); pen = true; });
      return '<path d="' + d + '" fill="none" stroke="' + m.color + '" stroke-width="1.1" stroke-opacity=".8"/>';
    }).join('');
    var h = '<h2>Modellen</h2><div class="card"><div class="ctitle">Zes modellen naast elkaar<span>temperatuur, 5 dagen</span></div>' +
      '<svg viewBox="0 0 ' + VW + ' ' + Hh + '" class="chart" role="img">' + g + lines + '<path d="' + path(hs.map(function (hh, i) { return [x(i), y(hh.temp)]; })) + '" class="ln white"/></svg><div class="axis abs">' + xl + '</div>' +
      '<div class="legend wrap"><span><i class="lg lnW"></i>Isobar-gemiddelde</span>' + W.MODELS.map(function (m) { return '<span><i class="lg" style="background:' + m.color + '"></i>' + m.name + '</span>'; }).join('') + '</div></div>';

    if (S.skill) {
      var rows = S.skill.rows.filter(function (r) { return r.tMae != null; }).sort(function (a, b) { return a.tMae - b.tMae; });
      var worst = Math.max.apply(null, rows.map(function (r) { return r.tMae; }));
      h += '<div class="card"><div class="ctitle">Wie had gelijk?<span>afgelopen 30 dagen, hier</span></div><div class="sk head"><span></span><span>temperatuur</span><span>regen/dag</span><span>weegt</span></div>' +
        rows.map(function (r) {
          var m = W.MODELS.filter(function (x) { return x.id === r.id; })[0], bl = r.id === 'blend';
          var wt = S.weights && S.weights.temp[r.id];
          return '<div class="sk' + (bl ? ' blend' : '') + '"><span><i style="background:' + (bl ? '#fff' : m.color) + '"></i>' + (bl ? 'Alle zes samen' : m.name.replace(/ \(.*/, '')) + '</span>' +
            '<span><em style="width:' + (r.tMae / worst * 100) + '%"></em>' + F.n1(r.tMae) + '°</span><span>' + (r.rMae != null ? F.n1(r.rMae) + ' mm' : '–') + '</span><span>' + (bl ? '' : wt ? '×' + F.n1(wt) : '×1,0') + '</span></div>';
        }).join('') +
        '<p class="note">Hoe ver de voorspelling van één dag eerder er gemiddeld naast zat (kleiner is beter). Modellen die hier beter scoren wegen zwaarder mee in het gemiddelde. De uitkomst is de beste modelanalyse voor deze plek, geen eigen weerstation.</p></div>';
    }
    h += '<div class="card foot"><p><b>Isobar</b> combineert KNMI Harmonie, ICON, ECMWF, GFS, Météo-France en UKMO. Zes weken vooruit: ECMWF EC46 en het GFS-ensemble, samen ruim 80 berekeningen. Weerdata: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0).</p>' +
      '<button id="refresh" class="btn">Nu vernieuwen</button></div>';
    $('s-mod').innerHTML = h;
  }

  /* ---------- alles tekenen, scrollpositie vasthouden ---------- */
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  var pending = false;
  function renderAll() {
    if (pending) return; pending = true;
    requestAnimationFrame(function () {
      pending = false;
      var S = W.S, sc = $('scroll'), nu = $('s-nu'), before = nu.offsetTop;
      try {
        if (S.hours && S.hours.length) { renderNu(S); render14(S); renderMod(S); }
        else if (S.errors.length) $('s-nu').innerHTML = '<div class="hero"><div class="cond">Geen verbinding</div><div class="sub">De weerdata kon niet worden opgehaald. Controleer je internet.</div><button id="refresh" class="btn">Opnieuw proberen</button></div>';
        if (S.hist) renderTerug(S);
        if (S.long) render6w(S);
      } catch (e) { console.error(e); }
      if (!ui.scrolled) { ui.auto = true; sc.scrollTop = nu.offsetTop - 56; }
      else if (sc.scrollTop >= before - 60) { ui.auto = true; sc.scrollTop += nu.offsetTop - before; }
      $('locName').textContent = S.loc.name;
      $('upd').textContent = S.updated ? (S.stale ? 'offline · ' : '') + F.uur(S.updated + S.off) : '';
      if (S.press) W.map.setData(S.press);
      onScroll();
    });
  }

  /* ---------- kaarttijd volgt de plek op de tijdlijn ---------- */
  function setMapTime(tP, label) {
    var S = W.S; if (!S) return;
    var utc = tP - (S.off || 0), r = W.map.range();
    if (r) utc = Math.max(r[0], Math.min(r[1], utc));
    W.map.setTime(utc);
    var chip = $('mapTime'), isNow = Math.abs(utc - Date.now()) < 90 * 60e3;
    chip.textContent = isNow ? '' : 'kaart: ' + F.dag(utc + S.off) + ' ' + F.datum(utc + S.off) + ' ' + F.uur(utc + S.off);
    chip.classList.toggle('show', !isNow && !ui.mapMode);
    if (ui.mapMode) $('mapLabel').textContent = cap(F.datumL(utc + S.off)) + ' · ' + F.uur(utc + S.off);
  }
  function onScroll() {
    var S = W.S; if (!S || ui.mapMode) return;
    var sc = $('scroll'), mid = window.innerHeight * 0.45, now = nowP(S), best = null;
    ['s-terug', 's-nu', 's-14', 's-6w', 's-mod'].forEach(function (id) {
      var r = $(id).getBoundingClientRect();
      if (r.top <= mid && r.bottom > mid) best = { id: id, r: r };
    });
    if (!best) best = { id: sc.scrollTop < 100 ? 's-terug' : 's-mod', r: null };
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.go === best.id); });
    var t = now;
    if (best.id === 's-terug' && best.r) t = now - Math.max(0, Math.min(1, (best.r.bottom - mid) / best.r.height)) * 7 * DAY;
    else if (best.id === 's-nu') {
      var hsEl = $('hstrip');
      if (hsEl && hsEl.scrollLeft > 20) { var c = hsEl.children[Math.round(hsEl.scrollLeft / 62)]; if (c) t = +c.dataset.t; }
    } else if (best.id === 's-14') {
      var rows = document.querySelectorAll('.drow'), bd = 1e9;
      rows.forEach(function (el) { var r = el.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bd) { bd = d; t = +el.dataset.t; } });
    }
    setMapTime(t);
  }

  /* ---------- kaartmodus ---------- */
  function mapMode(on) {
    ui.mapMode = on;
    document.body.classList.toggle('mapmode', on);
    W.map.setCities(on);
    if (ui.playing) { clearInterval(ui.playing); ui.playing = null; $('mapPlay').textContent = 'Afspelen'; }
    if (on) {
      var r = W.map.range(), sl = $('mapSlider');
      if (r) { sl.min = r[0]; sl.max = r[1]; sl.step = HOUR; sl.value = Date.now(); }
      setMapTime(nowP(W.S));
    } else onScroll();
  }

  /* ---------- locaties ---------- */
  function locs() { return W.lsGet('locs') || [{ name: 'Zwijndrecht', lat: 51.8175, lon: 4.6333 }]; }
  function curLoc() { var l = locs(), i = W.lsGet('cur') || 0; return l[i] || l[0]; }
  function renderSheet(results) {
    var l = locs(), ci = W.lsGet('cur') || 0;
    $('locList').innerHTML = l.map(function (x, i) {
      return '<div class="lrow' + (i === ci ? ' on' : '') + '"><button data-sel="' + i + '">' + esc(x.name) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</button>' + (l.length > 1 ? '<button class="del" data-del="' + i + '" aria-label="Verwijder ' + esc(x.name) + '">×</button>' : '') + '</div>';
    }).join('');
    $('locRes').innerHTML = (results || []).map(function (x, i) { return '<button data-add="' + i + '">' + esc(x.name) + '<small>' + esc(x.sub) + '</small></button>'; }).join('');
    ui.results = results || [];
  }
  function selectLoc(i) { W.lsSet('cur', i); $('sheet').hidden = true; ui.scrolled = false; ui.actDay = null; start(); }

  /* ---------- starten ---------- */
  var loadId = 0;
  function start() {
    var loc = curLoc(), id = ++loadId;
    W.map.setCenter(loc.lat, loc.lon);
    $('locName').textContent = loc.name;
    document.body.classList.add('loading');
    W.load(loc, function (name, S) { if (id !== loadId) return; W.S = S; ui.loadedAt = Date.now(); renderAll(); })
      .then(function () { if (id === loadId) document.body.classList.remove('loading'); });
  }

  function init() {
    W.map.init($('map'));
    var sc = $('scroll'), tick = false;
    sc.addEventListener('scroll', function () {
      if (ui.auto) ui.auto = false; else ui.scrolled = true;
      if (!tick) { tick = true; requestAnimationFrame(function () { tick = false; onScroll(); }); }
    }, { passive: true });
    document.addEventListener('scroll', function (e) { if (e.target && e.target.id === 'hstrip') onScroll(); }, true);
    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      ui.scrolled = true;
      var el = $(b.dataset.go); sc.scrollTo({ top: el.offsetTop - 56, behavior: 'smooth' });
    });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('button,[data-t]'); if (!t) return;
      if (t.dataset.act) { ui.act = t.dataset.act; W.lsSet('act', ui.act); renderBuiten(W.S); }
      else if (t.dataset.day) { ui.actDay = +t.dataset.day; renderBuiten(W.S); }
      else if (t.id === 'refresh') { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('isobar:c:') === 0 && !/clim|skill/.test(k)) localStorage.removeItem(k); }); start(); }
      else if (t.id === 'mapBtn') mapMode(true);
      else if (t.id === 'mapClose') mapMode(false);
      else if (t.id === 'mapPlay') {
        if (ui.playing) { clearInterval(ui.playing); ui.playing = null; t.textContent = 'Afspelen'; }
        else {
          var sl = $('mapSlider'); t.textContent = 'Pauze';
          ui.playing = setInterval(function () { var v = +sl.value + 2 * HOUR; if (v > +sl.max) v = +sl.min; sl.value = v; setMapTime(v + W.S.off); }, 120);
        }
      }
      else if (t.id === 'locBtn') { renderSheet(); $('sheet').hidden = false; }
      else if (t.id === 'sheetClose') $('sheet').hidden = true;
      else if (t.dataset.sel != null) selectLoc(+t.dataset.sel);
      else if (t.dataset.del != null) { var l = locs(); l.splice(+t.dataset.del, 1); W.lsSet('locs', l); W.lsSet('cur', 0); renderSheet(); start(); }
      else if (t.dataset.add != null) { var l2 = locs(); l2.push(ui.results[+t.dataset.add]); W.lsSet('locs', l2); $('locQ').value = ''; selectLoc(l2.length - 1); }
      else if (t.id === 'locHere') {
        if (!navigator.geolocation) return;
        t.textContent = 'Locatie zoeken…';
        navigator.geolocation.getCurrentPosition(function (p) {
          var l3 = locs().filter(function (x) { return x.name !== 'Mijn locatie'; });
          l3.push({ name: 'Mijn locatie', lat: p.coords.latitude, lon: p.coords.longitude }); W.lsSet('locs', l3); t.textContent = 'Gebruik mijn huidige locatie'; selectLoc(l3.length - 1);
        }, function () { t.textContent = 'Locatie niet beschikbaar'; });
      }
      else if (t.dataset.t && (t.classList.contains('wb') || t.classList.contains('mb'))) setMapTime(+t.dataset.t);
    });
    $('mapSlider').addEventListener('input', function () { setMapTime(+this.value + W.S.off); });
    var deb;
    $('locQ').addEventListener('input', function () {
      var q = this.value.trim(); clearTimeout(deb);
      if (q.length < 2) { renderSheet(); return; }
      deb = setTimeout(function () { W.searchPlaces(q).then(renderSheet).catch(function () { renderSheet(); }); }, 350);
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && ui.loadedAt && Date.now() - ui.loadedAt > 20 * 60e3) start(); });
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
    start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
