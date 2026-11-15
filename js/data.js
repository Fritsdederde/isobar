/* Isobar — data: ophalen, bewaren en combineren van weermodellen (bron: Open-Meteo) */
'use strict';
var W = window.W || (window.W = {});
(function () {
  var HOUR = 3600e3, DAY = 86400e3;
  W.HOUR = HOUR; W.DAY = DAY;

  W.MODELS = [
    { id: 'knmi_harmonie_arome_netherlands', name: 'KNMI Harmonie', color: '#F5A524' },
    { id: 'icon_seamless', name: 'ICON (Duitsland)', color: '#7CC0FF' },
    { id: 'ecmwf_ifs025', name: 'ECMWF (Europa)', color: '#5FD39A' },
    { id: 'gfs_seamless', name: 'GFS (VS)', color: '#E879A6' },
    { id: 'meteofrance_seamless', name: 'Météo-France', color: '#B79CFF' },
    { id: 'ukmo_seamless', name: 'UKMO (VK)', color: '#F2E36B' }
  ];
  var VARS = ['temperature_2m', 'apparent_temperature', 'precipitation', 'weather_code',
    'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'cloud_cover'];

  /* ---------- opslag ---------- */
  var LS = 'isobar:';
  function lsGet(k) { try { var s = localStorage.getItem(LS + k); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function lsSet(k, v) {
    var s = JSON.stringify(v);
    try { localStorage.setItem(LS + k, s); } catch (e) {
      try {
        Object.keys(localStorage).forEach(function (x) { if (x.indexOf(LS + 'c:') === 0) localStorage.removeItem(x); });
        localStorage.setItem(LS + k, s);
      } catch (e2) { /* opslag niet beschikbaar: app werkt door zonder cache */ }
    }
  }
  W.lsGet = lsGet; W.lsSet = lsSet;

  async function getJSON(url) {
    var r = await fetch(url);
    var j = await r.json();
    if (!r.ok || (j && j.error)) throw new Error((j && j.reason) || ('HTTP ' + r.status));
    return j;
  }
  /* Haalt op met cache. Bij een netwerkfout wordt de oude versie gebruikt (offline). */
  async function cached(key, ttl, fn) {
    var c = lsGet('c:' + key);
    if (c && Date.now() - c.t < ttl) return { v: c.v, t: c.t };
    try {
      var v = await fn();
      lsSet('c:' + key, { t: Date.now(), v: v });
      return { v: v, t: Date.now() };
    } catch (e) {
      if (c) return { v: c.v, t: c.t, stale: true };
      throw e;
    }
  }

  /* ---------- hulpjes ---------- */
  function pt(s) { return Date.parse(s.length === 10 ? s + 'T00:00:00Z' : s + ':00Z'); } // "lokale" tijd als pseudo-UTC
  function r1(x) { return x == null ? null : Math.round(x * 10) / 10; }
  function wmean(vals, wts) {
    var s = 0, w = 0;
    for (var i = 0; i < vals.length; i++) if (vals[i] != null) { s += vals[i] * wts[i]; w += wts[i]; }
    return w ? s / w : null;
  }
  function dirMean(dirs, wts) {
    var x = 0, y = 0, n = 0;
    for (var i = 0; i < dirs.length; i++) if (dirs[i] != null) {
      var a = dirs[i] * Math.PI / 180, w = wts ? (wts[i] || 0.01) : 1;
      x += Math.sin(a) * w; y += Math.cos(a) * w; n++;
    }
    return n ? (Math.atan2(x, y) * 180 / Math.PI + 360) % 360 : null;
  }
  function pct(sorted, p) {
    if (!sorted.length) return null;
    var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }
  W.bft = function (kmh) {
    var lim = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
    for (var i = 0; i < lim.length; i++) if (kmh < lim[i]) return i;
    return 12;
  };
  W.compass = function (deg) {
    return ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'][Math.round(deg / 45) % 8];
  };
  W.compassLong = function (deg) {
    return ['noorden', 'noordoosten', 'oosten', 'zuidoosten', 'zuiden', 'zuidwesten', 'westen', 'noordwesten'][Math.round(deg / 45) % 8];
  };
  function locQ(loc) { return 'latitude=' + loc.lat.toFixed(4) + '&longitude=' + loc.lon.toFixed(4) + '&timezone=auto'; }
  function locKey(loc) { return loc.lat.toFixed(2) + ',' + loc.lon.toFixed(2); }

  /* ---------- 1. korte termijn: zes modellen per uur ---------- */
  async function fetchForecast(loc) {
    return cached('fc:' + locKey(loc), 30 * 60e3, function () {
      return getJSON('https://api.open-meteo.com/v1/forecast?' + locQ(loc) + '&hourly=' + VARS.join(',') +
        '&models=' + W.MODELS.map(function (m) { return m.id; }).join(',') + '&past_days=1&forecast_days=15');
    });
  }

  function blendForecast(j, weights) {
    var h = j.hourly, n = h.time.length, M = W.MODELS;
    var wT = M.map(function (m) { return (weights && weights.temp[m.id]) || 1; });
    var wR = M.map(function (m) { return (weights && weights.rain[m.id]) || 1; });
    var w1 = M.map(function () { return 1; });
    function col(v, i) { return M.map(function (m) { var a = h[v + '_' + m.id]; return a ? a[i] : null; }); }
    var hours = [];
    for (var i = 0; i < n; i++) {
      var T = col('temperature_2m', i), R = col('precipitation', i), S = col('wind_speed_10m', i), C = col('weather_code', i);
      var tv = T.filter(function (x) { return x != null; });
      if (!tv.length) continue;
      var rv = R.filter(function (x) { return x != null; });
      hours.push({
        t: pt(h.time[i]),
        temp: wmean(T, wT), tLo: Math.min.apply(null, tv), tHi: Math.max.apply(null, tv),
        feel: wmean(col('apparent_temperature', i), wT),
        rain: wmean(R, wR) || 0, rLo: rv.length ? Math.min.apply(null, rv) : 0, rHi: rv.length ? Math.max.apply(null, rv) : 0,
        nWet: rv.filter(function (x) { return x >= 0.1; }).length, nR: rv.length,
        wind: wmean(S, w1) || 0, gust: wmean(col('wind_gusts_10m', i), w1) || 0,
        dir: dirMean(col('wind_direction_10m', i), S),
        cloud: wmean(col('cloud_cover', i), w1),
        thunder: C.some(function (c) { return c != null && c >= 95; }),
        snow: C.filter(function (c) { return c != null && ((c >= 71 && c <= 77) || c === 85 || c === 86); }).length * 2 > tv.length,
        fog: C.filter(function (c) { return c === 45 || c === 48; }).length * 2 > tv.length,
        per: T, perR: R, n: tv.length
      });
    }
    return hours;
  }

  function buildDays(hours) {
    var M = W.MODELS, map = {}, order = [];
    hours.forEach(function (h) {
      var k = Math.floor(h.t / DAY);
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(h);
    });
    return order.map(function (k) {
      var hs = map[k];
      var temps = hs.map(function (h) { return h.temp; });
      var d = {
        t: k * DAY, hours: hs, n: hs.length,
        tmax: Math.max.apply(null, temps), tmin: Math.min.apply(null, temps),
        rain: hs.reduce(function (s, h) { return s + h.rain; }, 0),
        wind: Math.max.apply(null, hs.map(function (h) { return h.wind; })),
        gust: Math.max.apply(null, hs.map(function (h) { return h.gust; })),
        dir: dirMean(hs.map(function (h) { return h.dir; }), hs.map(function (h) { return h.wind; }))
      };
      var dayH = hs.filter(function (h) { var u = new Date(h.t).getUTCHours(); return u >= 8 && u <= 18; });
      d.cloud = wmean((dayH.length ? dayH : hs).map(function (h) { return h.cloud; }), (dayH.length ? dayH : hs).map(function () { return 1; }));
      d.thunder = hs.some(function (h) { return h.thunder; });
      d.snow = hs.filter(function (h) { return h.snow && h.rain > 0.1; }).length >= 2;
      // per model: max, min en regensom (alleen als het model de dag vrijwel volledig dekt)
      var mx = [], mn = [], rs = [];
      M.forEach(function (m, mi) {
        var tv = hs.map(function (h) { return h.per[mi]; }).filter(function (x) { return x != null; });
        if (tv.length >= Math.min(20, hs.length)) {
          mx.push(Math.max.apply(null, tv)); mn.push(Math.min.apply(null, tv));
          rs.push(hs.reduce(function (s, h) { return s + (h.perR[mi] || 0); }, 0));
        }
      });
      d.nMod = mx.length;
      d.maxLo = mx.length ? Math.min.apply(null, mx) : d.tmax; d.maxHi = mx.length ? Math.max.apply(null, mx) : d.tmax;
      d.minLo = mn.length ? Math.min.apply(null, mn) : d.tmin; d.minHi = mn.length ? Math.max.apply(null, mn) : d.tmin;
      d.rLo = rs.length ? Math.min.apply(null, rs) : d.rain; d.rHi = rs.length ? Math.max.apply(null, rs) : d.rain;
      d.nWet = rs.filter(function (x) { return x >= 1; }).length;
      var spread = Math.max(d.maxHi - d.maxLo, d.minHi - d.minLo);
      var rainSplit = d.nMod > 1 && d.nWet > 0 && d.nWet < d.nMod && (d.rHi - d.rLo) > 2;
      d.spread = spread;
      d.conf = (spread > 4.5 || (rainSplit && d.rHi - d.rLo > 6)) ? 0 : (spread > 2.5 || rainSplit) ? 1 : 2; // 0 laag, 1 redelijk, 2 hoog
      return d;
    });
  }

  /* ---------- 2. regen komende 2 uur + terugkijken ---------- */
  async function fetchNowcast(loc) {
    return cached('nc:' + locKey(loc), 10 * 60e3, async function () {
      var j = await getJSON('https://api.open-meteo.com/v1/forecast?' + locQ(loc) + '&minutely_15=precipitation&forecast_minutely_15=9');
      return { t: j.minutely_15.time.map(pt), r: j.minutely_15.precipitation };
    });
  }
  async function fetchHistory(loc) {
    return cached('hist:' + locKey(loc), 2 * HOUR, async function () {
      var j = await getJSON('https://api.open-meteo.com/v1/forecast?' + locQ(loc) +
        '&daily=precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,sunrise,sunset&past_days=35&forecast_days=3');
      var d = j.daily;
      return {
        off: j.utc_offset_seconds * 1000, t: d.time.map(pt), rain: d.precipitation_sum,
        tmax: d.temperature_2m_max, tmin: d.temperature_2m_min, wind: d.wind_speed_10m_max,
        rise: d.sunrise.map(pt), set: d.sunset.map(pt)
      };
    });
  }

  /* ---------- 3. zes weken: ECMWF EC46 (46 dagen) + GFS-ensemble (35 dagen) ---------- */
  async function fetchLong(loc) {
    return cached('long:' + locKey(loc), 6 * HOUR, async function () {
      var q = locQ(loc) + '&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_mean,wind_direction_10m_dominant';
      var res = await Promise.allSettled([
        getJSON('https://seasonal-api.open-meteo.com/v1/seasonal?' + q + '&models=ecmwf_ec46&forecast_days=46'),
        getJSON('https://ensemble-api.open-meteo.com/v1/ensemble?' + q + '&models=gfs05&forecast_days=35')
      ]);
      var ok = res.filter(function (r) { return r.status === 'fulfilled'; }).map(function (r) { return r.value; });
      if (!ok.length) throw new Error('langetermijnmodellen niet bereikbaar');
      var byDay = {}, order = [];
      ok.forEach(function (j) {
        var d = j.daily, keys = Object.keys(d);
        function members(v) { return keys.filter(function (k) { return k === v || k.indexOf(v + '_member') === 0; }).map(function (k) { return d[k]; }); }
        var T = members('temperature_2m_mean'), R = members('precipitation_sum'), S = members('wind_speed_10m_mean'), D = members('wind_direction_10m_dominant');
        d.time.forEach(function (ds, i) {
          var o = byDay[ds] || (order.push(ds), byDay[ds] = { T: [], R: [], S: [], D: [] });
          function add(dst, src) { src.forEach(function (a) { if (a[i] != null) dst.push(a[i]); }); }
          add(o.T, T); add(o.R, R); add(o.S, S); add(o.D, D);
        });
      });
      order.sort();
      var days = order.map(function (ds) {
        var o = byDay[ds];
        if (o.T.length < 5) return null;
        var num = function (a, b) { return a - b; };
        o.T.sort(num); o.R.sort(num); o.S.sort(num);
        var mean = function (a) { return a.reduce(function (s, x) { return s + x; }, 0) / (a.length || 1); };
        return {
          t: pt(ds), n: o.T.length,
          tm: r1(mean(o.T)), t10: r1(pct(o.T, 0.1)), t90: r1(pct(o.T, 0.9)),
          r: r1(mean(o.R)), r10: r1(pct(o.R, 0.1)), r90: r1(pct(o.R, 0.9)),
          rp: Math.round(100 * o.R.filter(function (x) { return x >= 1; }).length / (o.R.length || 1)),
          w: r1(mean(o.S)), w10: r1(pct(o.S, 0.1)), w90: r1(pct(o.S, 0.9)),
          dir: Math.round(dirMean(o.D) || 0)
        };
      }).filter(Boolean);
      return { days: days, sources: ok.length };
    });
  }

  /* ---------- 4. normaal voor de tijd van het jaar (10 jaar metingen/heranalyse) ---------- */
  function doy(t) { var d = new Date(t); return Math.floor((t - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY); }
  W.doy = doy;
  async function fetchClimate(loc) {
    return cached('clim:' + locKey(loc), 21 * DAY, async function () {
      var end = new Date(Date.now() - 6 * DAY), start = new Date(end.getTime() - 3653 * DAY);
      var iso = function (d) { return d.toISOString().slice(0, 10); };
      var j = await getJSON('https://archive-api.open-meteo.com/v1/archive?' + locQ(loc) + '&start_date=' + iso(start) + '&end_date=' + iso(end) +
        '&daily=temperature_2m_mean,precipitation_sum,wind_speed_10m_mean');
      var d = j.daily, keys = ['temperature_2m_mean', 'precipitation_sum', 'wind_speed_10m_mean'];
      var sum = keys.map(function () { return new Float64Array(366); }), cnt = keys.map(function () { return new Float64Array(366); });
      d.time.forEach(function (ds, i) {
        var k = doy(pt(ds));
        keys.forEach(function (v, vi) { var x = d[v][i]; if (x != null) { sum[vi][k] += x; cnt[vi][k]++; } });
      });
      function smooth(vi, win) {
        var out = [];
        for (var k = 0; k < 366; k++) {
          var s = 0, c = 0;
          for (var o = -win; o <= win; o++) { var q = (k + o + 366) % 366; s += sum[vi][q]; c += cnt[vi][q]; }
          out.push(c ? Math.round(s / c * 100) / 100 : null);
        }
        return out;
      }
      // neerslag van ±een jaar geleden bewaren voor "vorig jaar"
      var ly = {}, lim = Date.now() - 300 * DAY;
      d.time.forEach(function (ds, i) { var t = pt(ds); if (t > lim - 150 * DAY && t < lim + 40 * DAY) ly[ds] = d.precipitation_sum[i]; });
      return { t: smooth(0, 7), r: smooth(1, 10), w: smooth(2, 7), ly: ly };
    });
  }

  /* ---------- 5. wie had gelijk? voorspelling van 1 dag vooruit tegenover de uitkomst ---------- */
  async function fetchSkill(loc) {
    return cached('skill:' + locKey(loc), 12 * HOUR, async function () {
      var M = W.MODELS, ids = M.map(function (m) { return m.id; });
      var pair = await Promise.all([
        getJSON('https://previous-runs-api.open-meteo.com/v1/forecast?' + locQ(loc) +
          '&hourly=temperature_2m_previous_day1,precipitation_previous_day1&models=' + ids.join(',') + '&past_days=30&forecast_days=1'),
        getJSON('https://api.open-meteo.com/v1/forecast?' + locQ(loc) + '&hourly=temperature_2m,precipitation&past_days=30&forecast_days=1')
      ]);
      var p = pair[0].hourly, tr = pair[1].hourly, idx = {};
      tr.time.forEach(function (s, i) { idx[s] = i; });
      var nowP = Date.now() + pair[1].utc_offset_seconds * 1000;
      var cols = ids.map(function (id) { return { T: p['temperature_2m_previous_day1_' + id] || [], R: p['precipitation_previous_day1_' + id] || [] }; });
      cols.push({ blend: true });
      var out = cols.map(function () { return { tErr: 0, tN: 0, days: {} }; });
      p.time.forEach(function (s, i) {
        var k = idx[s]; if (k == null || pt(s) > nowP - HOUR) return;
        var tt = tr.temperature_2m[k], rr = tr.precipitation[k]; if (tt == null || rr == null) return;
        var day = s.slice(0, 10), bt = [], br = [];
        cols.forEach(function (c, ci) {
          var ft, fr;
          if (c.blend) {
            if (!bt.length) return;
            ft = bt.reduce(function (a, b) { return a + b; }, 0) / bt.length;
            fr = br.reduce(function (a, b) { return a + b; }, 0) / br.length;
          } else { ft = c.T[i]; fr = c.R[i]; if (ft == null || fr == null) return; bt.push(ft); br.push(fr); }
          var o = out[ci]; o.tErr += Math.abs(ft - tt); o.tN++;
          var dd = o.days[day] || (o.days[day] = { f: 0, a: 0, n: 0 }); dd.f += fr; dd.a += rr; dd.n++;
        });
      });
      var rows = out.map(function (o, ci) {
        var rE = 0, rN = 0;
        Object.keys(o.days).forEach(function (k) { var d = o.days[k]; if (d.n >= 20) { rE += Math.abs(d.f - d.a); rN++; } });
        return {
          id: ci < ids.length ? ids[ci] : 'blend', tMae: o.tN > 100 ? Math.round(o.tErr / o.tN * 100) / 100 : null,
          rMae: rN >= 7 ? Math.round(rE / rN * 100) / 100 : null, n: rN
        };
      });
      return { rows: rows };
    });
  }
  /* Gewichten: een model dat hier vaker goed zat telt zwaarder mee (begrensd, zodat geen model alles bepaalt). */
  function weightsFromSkill(skill) {
    var w = { temp: {}, rain: {} };
    if (!skill) return null;
    [['temp', 'tMae', 0.3], ['rain', 'rMae', 0.4]].forEach(function (c) {
      var rows = skill.rows.filter(function (r) { return r.id !== 'blend' && r[c[1]] != null; });
      if (rows.length < 2) return;
      var raw = rows.map(function (r) { return 1 / Math.pow(r[c[1]] + c[2], 2); });
      var avg = raw.reduce(function (a, b) { return a + b; }, 0) / raw.length;
      rows.forEach(function (r, i) { w[c[0]][r.id] = Math.max(0.5, Math.min(2, raw[i] / avg)); });
    });
    return w;
  }

  /* ---------- 6. luchtdrukkaart Noordwest-Europa ---------- */
  var GRID = { lon0: -24, dlon: 4, nx: 13, lat0: 34, dlat: 3, ny: 13 };
  W.GRID = GRID;
  async function fetchPressure() {
    return cached('press', 3 * HOUR, async function () {
      var la = [], lo = [];
      for (var y = 0; y < GRID.ny; y++) for (var x = 0; x < GRID.nx; x++) { la.push(GRID.lat0 + y * GRID.dlat); lo.push(GRID.lon0 + x * GRID.dlon); }
      var j = await getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + la.join(',') + '&longitude=' + lo.join(',') +
        '&hourly=pressure_msl&past_days=7&forecast_days=11&temporal_resolution=hourly_3');
      var times = j[0].hourly.time, n = times.length, d = [];
      for (var f = 0; f < n; f++) for (var i = 0; i < j.length; i++) {
        var v = j[i].hourly.pressure_msl[f];
        d.push(v == null ? null : Math.round(v * 10));
      }
      // gaten vullen met de vorige waarde van hetzelfde punt
      var np = j.length;
      for (var q = 0; q < d.length; q++) if (d[q] == null) d[q] = q >= np && d[q - np] != null ? d[q - np] : 10130;
      return { t0: Date.parse(times[0] + ':00Z'), step: Date.parse(times[1] + ':00Z') - Date.parse(times[0] + ':00Z'), n: n, d: d };
    });
  }

  /* ---------- locaties ---------- */
  W.searchPlaces = async function (name) {
    var j = await getJSON('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&count=6&language=nl');
    return (j.results || []).map(function (r) {
      return { name: r.name, sub: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude };
    });
  };

  /* ---------- alles samen ---------- */
  W.load = async function (loc, onPart) {
    var S = { loc: loc, errors: [] };
    function part(name, promise, apply) {
      return promise.then(function (r) { apply(r); if (r.stale) S.stale = true; onPart && onPart(name, S); })
        .catch(function (e) { S.errors.push(name + ': ' + e.message); onPart && onPart(name, S); });
    }
    var skillP = fetchSkill(loc).catch(function () { return null; });
    var jobs = [
      part('fc', Promise.all([fetchForecast(loc), skillP]), function (r) {
        var fc = r[0], skill = r[1] && r[1].v;
        S.skill = skill; S.weights = weightsFromSkill(skill);
        S.off = fc.v.utc_offset_seconds * 1000; S.updated = fc.t; if (fc.stale) S.stale = true;
        S.hours = blendForecast(fc.v, S.weights); S.days = buildDays(S.hours);
      }),
      part('now', fetchNowcast(loc), function (r) { S.nowcast = r.v; }),
      part('hist', fetchHistory(loc), function (r) { S.hist = r.v; }),
      part('long', fetchLong(loc), function (r) { S.long = r.v; }),
      part('clim', fetchClimate(loc), function (r) { S.clim = r.v; }),
      part('press', fetchPressure(), function (r) { S.press = r.v; })
    ];
    await Promise.all(jobs);
    return S;
  };
})();
