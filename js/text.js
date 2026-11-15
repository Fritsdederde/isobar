/* Isobar — taal: weerpraatje, de grote lijn, buitenscores */
'use strict';
var W = window.W || (window.W = {});
(function () {
  var HOUR = W.HOUR, DAY = W.DAY;
  var DAGEN = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'], DAGEN_L = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  var MND = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  var MND_L = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  W.fmt = {
    n1: function (x) { return (Math.round(x * 10) / 10).toFixed(1).replace('.', ','); },
    mm: function (x) { return x < 0.05 ? '0' : x < 10 ? W.fmt.n1(x) : String(Math.round(x)); },
    dag: function (t) { return DAGEN[new Date(t).getUTCDay()]; },
    dagL: function (t) { return DAGEN_L[new Date(t).getUTCDay()]; },
    datum: function (t) { var d = new Date(t); return d.getUTCDate() + ' ' + MND[d.getUTCMonth()]; },
    datumL: function (t) { var d = new Date(t); return DAGEN_L[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MND_L[d.getUTCMonth()]; },
    uur: function (t) { var d = new Date(t); return ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2); },
    u: function (t) { return new Date(t).getUTCHours() + ' uur'; }
  };
  var F = W.fmt;

  W.isNight = function (S, t) {
    var h = S.hist;
    if (h) for (var i = 0; i < h.t.length; i++) if (t >= h.t[i] && t < h.t[i] + DAY) return t < h.rise[i] || t > h.set[i];
    var u = new Date(t).getUTCHours(); return u < 7 || u >= 19;
  };

  /* soort weer voor één uur → icoon + kort woord */
  W.kind = function (h, night) {
    if (h.thunder && h.rain >= 0.3) return ['thunder', 'Onweer'];
    if (h.rain >= 0.15) {
      if (h.snow) return ['snow', 'Sneeuw'];
      if (h.rain >= 2.5) return ['shower', 'Stevige regen'];
      if (h.rain >= 0.6) return ['rain', 'Regen'];
      return ['drizzle', 'Lichte regen'];
    }
    if (h.fog) return ['fog', 'Mist'];
    var c = h.cloud == null ? 50 : h.cloud;
    if (c < 25) return night ? ['moon', 'Helder'] : ['sun', 'Zonnig'];
    if (c < 65) return night ? ['partly-n', 'Wolkenvelden'] : ['partly', 'Zon en wolken'];
    if (c < 88) return ['cloud', 'Bewolkt'];
    return ['cloud', 'Grijs'];
  };
  W.dayKind = function (d) {
    var maxR = Math.max.apply(null, d.hours.map(function (h) { return h.rain; }));
    var mid = { rain: d.rain >= 6 ? 3 : d.rain >= 1.5 ? 1 : d.rain >= 0.4 ? 0.3 : 0, cloud: d.cloud, snow: d.snow, thunder: d.thunder && maxR > 0.5 };
    if (d.rain >= 1.5 && maxR >= 2 && d.hours.filter(function (h) { return h.rain >= 0.2; }).length < 8) return ['shower', 'Buien'];
    return W.kind(mid, false);
  };

  function blok(hs, night) {
    if (!hs.length) return null;
    var R = 0, mx = 0, wet = 0, cl = 0, sn = 0, th = false;
    hs.forEach(function (h) { R += h.rain; mx = Math.max(mx, h.rain); if (h.rain >= 0.2) wet++; cl += h.cloud == null ? 50 : h.cloud; if (h.snow && h.rain > 0.1) sn++; th = th || (h.thunder && h.rain > 0.3); });
    cl /= hs.length;
    if (R < 0.3) {
      if (cl < 25) return night ? 'droog en helder' : 'droog en zonnig';
      if (cl < 65) return night ? 'droog met wolkenvelden' : 'droog met zon en wolken';
      if (cl < 88) return 'bewolkt maar droog';
      return 'grijs maar droog';
    }
    if (sn >= 2) return 'kans op (natte) sneeuw';
    if (th) return 'buien met kans op onweer';
    if (wet / hs.length >= 0.65 && R >= 3) return 'regenachtig';
    if (mx >= 2.5) return 'buien, soms fel';
    if (R < 1.5) return 'af en toe wat lichte regen';
    return 'af en toe regen';
  }
  /* "rond 18 uur", "vannacht rond 1 uur", "morgen rond 9 uur" */
  function kloktijd(t, now) {
    var u = new Date(t).getUTCHours(), d = Math.floor(t / DAY) - Math.floor(now / DAY);
    var klok = u === 0 ? 'middernacht' : u + ' uur';
    if (d === 0) return 'rond ' + klok;
    if (d === 1 && u < 6) return 'vannacht rond ' + klok;
    return (d === 1 ? 'morgen' : F.dagL(t)) + ' rond ' + klok;
  }
  var WINDW = ['nauwelijks wind', 'nauwelijks wind', 'een zwakke wind', 'een matige wind', 'een matige tot vrij krachtige wind', 'een vrij krachtige wind',
    'een krachtige wind', 'een harde wind', 'een stormachtige wind', 'storm', 'zware storm', 'zeer zware storm', 'orkaankracht'];
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  W.praatje = function (S) {
    var now = Date.now() + S.off, hs = S.hours, d0 = Math.floor(now / DAY) * DAY, out = [];
    function range(a, b) { return hs.filter(function (h) { return h.t >= Math.max(a, now - HOUR) && h.t < b; }); }
    var parts = [];
    [['vanochtend', 6, 12, false], ['vanmiddag', 12, 18, false], ['vanavond', 18, 24, true], ['vannacht', 24, 30, true]].forEach(function (p) {
      if (now >= d0 + p[2] * HOUR - HOUR) return;
      var b = blok(range(d0 + p[1] * HOUR, d0 + p[2] * HOUR), p[3]);
      if (!b) return;
      var last = parts[parts.length - 1];
      if (last && last.b === b) last.l.push(p[0]); else parts.push({ l: [p[0]], b: b });
    });
    if (parts.length) out.push(cap(parts.map(function (p) { return p.l.join(' en ') + ' ' + p.b; }).join(', ')) + '.');

    // eerste regen of eerste droge moment
    var next = hs.filter(function (h) { return h.t >= now - HOUR && h.t < now + 30 * HOUR; });
    if (next.length > 3) {
      var wetNow = next[0].rain >= 0.2 || (next[1] && next[1].rain >= 0.2);
      var k = -1;
      for (var i = 1; i < next.length - 1; i++) {
        if (!wetNow && next[i].rain >= 0.2) { k = i; break; }
        if (wetNow && next[i].rain < 0.1 && next[i + 1].rain < 0.1) { k = i; break; }
      }
      if (k > 1) {
        var wanneer = kloktijd(next[k].t, now);
        out.push(wetNow ? cap(wanneer) + ' wordt het droog.' : 'De eerste regen valt ' + wanneer + '.');
      }
    }
    // temperatuur
    var today = S.days.filter(function (d) { return d.t === d0; })[0], tom = S.days.filter(function (d) { return d.t === d0 + DAY; })[0];
    var hourNow = new Date(now).getUTCHours();
    if (today && hourNow < 15) {
      var mxh = today.hours.reduce(function (a, h) { return h.temp > a.temp ? h : a; }, today.hours[0]);
      var s = 'Het wordt ' + Math.round(today.tmax) + ' graden';
      if (mxh.feel != null && today.tmax - mxh.feel >= 3) s += ', maar door de wind voelt het als ' + Math.round(mxh.feel);
      out.push(s + '.');
    } else if (tom) {
      var nmin = Math.min.apply(null, range(d0 + 18 * HOUR, d0 + 32 * HOUR).map(function (h) { return h.temp; }));
      if (isFinite(nmin)) out.push('Vannacht koelt het af naar ' + Math.round(nmin) + ' graden' + (nmin <= 0 ? ', het gaat vriezen' : nmin <= 2.5 ? ', met kans op vorst aan de grond' : '') + '.');
    }
    // wind
    var rest = range(now, d0 + DAY);
    if (rest.length < 3) rest = range(now, now + 8 * HOUR);
    if (rest.length) {
      var top = rest.reduce(function (a, h) { return h.wind > a.wind ? h : a; }, rest[0]), b = W.bft(top.wind);
      var gust = Math.max.apply(null, rest.map(function (h) { return h.gust; }));
      var ws = b <= 1 ? 'Er staat nauwelijks wind' : 'Er staat ' + WINDW[b] + ' uit het ' + W.compassLong(top.dir || 0) + ' (' + b + ' Bft)';
      if (gust >= 55) ws += ', met windstoten tot ' + Math.round(gust / 5) * 5 + ' km/u';
      out.push(ws + '.');
    }
    if (tom) {
      var tb = blok(tom.hours.filter(function (h) { var u = new Date(h.t).getUTCHours(); return u >= 7 && u <= 21; }), false);
      out.push('Morgen ' + tb + ' bij ' + Math.round(tom.tmax) + ' graden.');
    }
    if (today && today.conf === 0) out.push('De modellen lopen vandaag flink uiteen, dus neem de details met een korrel zout.');
    return out.join(' ');
  };

  /* zes weken in weken opgedeeld, met normaal erbij */
  W.weeks = function (S) {
    if (!S.long) return [];
    var now = Date.now() + (S.off || 0), d0 = Math.floor(now / DAY) * DAY, C = S.clim;
    var days = S.long.days.filter(function (d) { return d.t >= d0; }), out = [];
    for (var w = 0; w < 6; w++) {
      var ds = days.slice(w * 7, w * 7 + 7);
      if (ds.length < 5) break;
      var avg = function (f) { return ds.reduce(function (s, d) { return s + f(d); }, 0) / ds.length; };
      var o = {
        i: w, t0: ds[0].t, t1: ds[ds.length - 1].t, n: ds.length,
        tm: avg(function (d) { return d.tm; }), rain: avg(function (d) { return d.r; }) * 7,
        wind: avg(function (d) { return d.w; }), spread: avg(function (d) { return d.t90 - d.t10; }),
        dir: (function () { var x = 0, y = 0; ds.forEach(function (d) { var a = d.dir * Math.PI / 180; x += Math.sin(a) * d.w; y += Math.cos(a) * d.w; }); return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360; })()
      };
      if (C) {
        o.tn = avg(function (d) { return C.t[W.doy(d.t)]; }); o.rn = avg(function (d) { return C.r[W.doy(d.t)]; }) * 7;
        o.dT = o.tm - o.tn; o.rr = o.rn > 0.5 ? o.rain / o.rn : 1;
      }
      out.push(o);
    }
    return out;
  };
  function tempWoord(dT, t) {
    var m = new Date(t).getUTCMonth(), zomer = m >= 3 && m <= 8, up = zomer ? 'warmer' : 'zachter', dn = zomer ? 'koeler' : 'kouder';
    if (dT > 2.5) return 'duidelijk ' + up + ' dan normaal';
    if (dT > 1) return 'iets ' + up + ' dan normaal';
    if (dT < -2.5) return 'duidelijk ' + dn + ' dan normaal';
    if (dT < -1) return 'iets ' + dn + ' dan normaal';
    return 'rond normaal voor de tijd van het jaar';
  }
  function tCat(dT) { return dT > 1 ? 1 : dT < -1 ? -1 : 0; }
  function rCat(rr) { return rr > 1.35 ? 1 : rr < 0.65 ? -1 : 0; }
  var RW = { '1': 'natter dan gebruikelijk', '0': 'ongeveer normaal qua regen', '-1': 'droger dan gebruikelijk' };

  W.groteLijn = function (S) {
    var wk = W.weeks(S);
    if (!wk.length || wk[0].dT == null) return wk.length ? 'De langetermijnverwachting is binnen; de vergelijking met normaal volgt zodra die geladen is.' : '';
    var a = wk[0], out = [];
    out.push('De komende week verloopt ' + tempWoord(a.dT, a.t0) + ' en ' + RW[rCat(a.rr)] + ', met gemiddeld windkracht ' + W.bft(a.wind) + ' uit het ' + W.compassLong(a.dir) + '.');
    var turn = null;
    for (var i = 1; i < wk.length; i++) if (tCat(wk[i].dT) !== tCat(a.dT) || rCat(wk[i].rr) !== rCat(a.rr)) { turn = wk[i]; break; }
    if (turn) out.push('Rond ' + F.datum(turn.t0) + ' verandert het beeld: ' + tempWoord(turn.dT, turn.t0) + ' en ' + RW[rCat(turn.rr)] + '.');
    else out.push('Daarna verandert er voorlopig weinig aan dat beeld.');
    var unsure = S.long.days.filter(function (d) { return d.t90 - d.t10 > 8; })[0];
    if (unsure) out.push('Vanaf ' + F.datum(unsure.t) + ' lopen de berekeningen ver uiteen: lees het daarna als richting, niet als belofte.');
    return out.join(' ');
  };

  /* ---------- buiten: fietsen en paarden ---------- */
  W.fiets = function (h) {
    var b = W.bft(h.wind), s = 10 - Math.min(6, h.rain * 4) - Math.max(0, b - 3) * 1.5 - (h.gust > 60 ? 2 : 0) - Math.max(0, 3 - h.temp) * 0.4 - Math.max(0, h.temp - 28) * 0.5;
    return Math.max(1, Math.min(10, s));
  };
  W.wandel = function (h) {
    var b = W.bft(h.wind), f = h.feel == null ? h.temp : h.feel;
    var s = 10 - Math.min(6, h.rain * 3.5) - Math.max(0, b - 4) * 1.3 - (h.gust > 65 ? 1.5 : 0) - Math.max(0, 2 - f) * 0.3 - Math.max(0, f - 27) * 0.5;
    return Math.max(1, Math.min(10, s));
  };
  function moment(t, now) {
    var d = Math.floor(t / DAY) - Math.floor(now / DAY);
    return d === 0 ? 'vandaag' : d === 1 ? 'morgen' : F.dagL(t);
  }
  /* regen per dag: gemeten/berekend voor het verleden, verwachting voor vandaag en later */
  function regenReeks(S) {
    var m = {};
    if (S.hist) S.hist.t.forEach(function (t, i) { if (S.hist.rain[i] != null) m[t] = S.hist.rain[i]; });
    S.days.forEach(function (d) { if (d.n >= 20 || m[d.t] == null) m[d.t] = d.rain; });
    return m;
  }
  /* drassigheid: regen van de voorgaande dagen telt mee, steeds iets minder zwaar */
  W.bodem = function (S, dayT) {
    var m = regenReeks(S), idx = 0, som = 0;
    for (var k = 1; k <= 7; k++) { var r = m[dayT - k * DAY]; if (r != null) { idx += r * Math.pow(0.72, k - 1); if (k <= 5) som += r; } }
    var woord = idx < 3 ? 'stevig en droog' : idx < 8 ? 'vochtig' : idx < 16 ? 'drassig' : 'erg drassig en modderig';
    return { idx: idx, som: som, woord: woord, straf: idx < 3 ? 0 : idx < 8 ? 0.5 : idx < 16 ? 1.2 : 2 };
  };

  W.activiteit = function (S, dayT, soort) {
    var now = Date.now() + S.off, day = S.days.filter(function (d) { return d.t === dayT; })[0];
    if (!day) return null;
    var hs = day.hours.filter(function (h) { return !W.isNight(S, h.t + HOUR / 2) && h.t >= now - HOUR; });
    var vandaag = Math.floor(now / DAY) * DAY === dayT;
    if (hs.length < 2) return { score: null, text: 'Het is vandaag al donker. Kies een andere dag voor een verwachting.', facts: [] };
    var avg = function (f) { return hs.reduce(function (s, h) { return s + f(h); }, 0) / hs.length; };
    var temp = avg(function (h) { return h.temp; }), feel = avg(function (h) { return h.feel == null ? h.temp : h.feel; });
    var feelMin = Math.min.apply(null, hs.map(function (h) { return h.feel == null ? h.temp : h.feel; }));
    var top = hs.reduce(function (a, h) { return h.wind > a.wind ? h : a; }, hs[0]), b = W.bft(top.wind);
    var gust = Math.max.apply(null, hs.map(function (h) { return h.gust; }));
    var rain = hs.reduce(function (s, h) { return s + h.rain; }, 0);
    var wet = hs.filter(function (h) { return h.rain >= 0.2; });
    var richting = W.compassLong(day.dir || top.dir || 0);
    var wanneerNat = '';
    if (wet.length) {
      var och = wet.filter(function (h) { return new Date(h.t).getUTCHours() < 12; }).length;
      wanneerNat = wet.length >= hs.length * 0.7 ? 'verspreid over de dag' : och === wet.length ? 'vooral in de ochtend' : och === 0 ? 'vooral in de middag' : 'met tussendoor droge uren';
    }
    var dagwoord = vandaag ? 'De rest van vandaag' : cap(moment(dayT, now));
    var zin = [], facts, score;
    var onzeker = day.conf === 0 ? ' De modellen zijn het over deze dag nog niet eens, dus dit kan nog schuiven.' : '';

    if (soort === 'paard') {
      var bo = W.bodem(S, dayT);
      score = 10 - Math.min(4, rain * 0.6) - Math.max(0, b - 3) * 1.0 - (gust > 60 ? 1 : 0) -
        Math.min(3, Math.max(0, 5 - feel) * 0.35) - Math.max(0, feel - 27) * 0.5 - bo.straf;
      var kou = feel < 0 ? 'Bitter koud in het open veld' : feel < 5 ? 'Koud in het open veld' : feel < 11 ? 'Fris buiten' : feel < 22 ? 'Aangenaam buiten' : 'Warm buiten';
      var s1 = kou + ': het is overdag gemiddeld ' + Math.round(temp) + ' graden';
      if (temp - feelMin >= 2.5) s1 += ', maar onbeschut voelt het als ' + Math.round(feelMin);
      zin.push(s1 + '.');
      zin.push(b <= 2 ? 'Er staat weinig wind.' : 'De wind komt uit het ' + richting + ' met kracht ' + b +
        (gust >= 50 ? ' en stoten tot ' + Math.round(gust / 5) * 5 + ' km/u' : '') + (gust >= 75 ? '; let tussen de bomen op vallende takken' : '') + '.');
      zin.push(rain < 0.3 ? 'Het blijft droog.' : 'Er valt overdag ongeveer ' + F.mm(rain) + ' mm regen, ' + wanneerNat + '.');
      zin.push('De grond is ' + bo.woord + (bo.som >= 1 ? ': in de vijf dagen ervoor ' + (dayT > now ? 'valt' : 'viel') + ' ' + F.mm(bo.som) + ' mm.' : '.'));
      facts = [['Gevoel', Math.round(feelMin) + '°'], ['Wind', b + ' Bft'], ['Regen', F.mm(rain) + ' mm'], ['Bodem', bo.woord.split(' ')[0] === 'erg' ? 'modder' : bo.woord.split(' ')[0]]];
    } else if (soort === 'mtb') {
      var bm = W.bodem(S, dayT), ms = bm.idx < 3 ? 0 : bm.idx < 8 ? 0.3 : bm.idx < 16 ? 1.8 : 3;
      score = 10 - Math.min(4, rain * 0.8) - Math.max(0, b - 4) * 0.8 - (gust > 70 ? 1.5 : 0) -
        Math.min(2.5, Math.max(0, 3 - feel) * 0.3) - Math.max(0, feel - 28) * 0.5 - ms;
      var paden = bm.idx < 3 ? 'De paden liggen er droog en snel bij' : bm.idx < 8 ? 'De paden zijn vochtig, met goede grip'
        : bm.idx < 16 ? 'De paden zijn drassig: reken op modder en gladde wortels' : 'De paden zijn erg modderig en kwetsbaar; een verharde route is nu de betere keuze';
      zin.push(paden + (bm.som >= 1 ? ' (in de vijf dagen ervoor ' + (dayT > now ? 'valt' : 'viel') + ' ' + F.mm(bm.som) + ' mm).' : '.'));
      zin.push(rain < 0.3 ? 'Onderweg blijft het droog.' : 'Onderweg valt ongeveer ' + F.mm(rain) + ' mm regen, ' + wanneerNat + '.');
      zin.push('Het is ' + Math.round(temp) + ' graden' + (temp - feelMin >= 2.5 ? ', op open stukken voelt het als ' + Math.round(feelMin) : '') + '.');
      zin.push(b <= 2 ? 'Er staat weinig wind.' : 'Wind uit het ' + richting + ', kracht ' + b +
        (gust >= 50 ? ' met stoten tot ' + Math.round(gust / 5) * 5 + ' km/u' : '') + (gust >= 75 ? '; let in het bos op vallende takken' : '') + '.');
      facts = [['Gevoel', Math.round(feelMin) + '°'], ['Wind', b + ' Bft'], ['Regen', F.mm(rain) + ' mm'], ['Paden', bm.idx < 3 ? 'droog' : bm.idx < 8 ? 'vochtig' : bm.idx < 16 ? 'drassig' : 'modder']];
    } else {
      var wandel = soort === 'wandel', fn = wandel ? W.wandel : W.fiets;
      score = avg(fn);
      var best = null;
      for (var i = 0; i + 1 < hs.length; i++) { var sc = (fn(hs[i]) + fn(hs[i + 1])) / 2; if (!best || sc > best.sc + 0.25) best = { sc: sc, t: hs[i].t }; }
      zin.push(rain < 0.3 ? dagwoord + ' blijft het droog' + (wandel ? '.' : ' op de fiets.') : dagwoord + ' valt er ongeveer ' + F.mm(rain) + ' mm regen, ' + wanneerNat + '.');
      if (wandel) {
        zin.push('Het is ' + Math.round(temp) + ' graden' + (temp - feelMin >= 2.5 ? ', in de wind voelt het als ' + Math.round(feelMin) : '') + '.');
        zin.push(b <= 2 ? 'Er staat weinig wind.' : 'De wind komt uit het ' + richting + ' met kracht ' + b +
          (gust >= 50 ? ' en stoten tot ' + Math.round(gust / 5) * 5 + ' km/u' : '') + (b >= 6 ? ': in open gebied is dat stevig doorlopen' : '') + '.');
        var bw = W.bodem(S, dayT);
        if (bw.idx >= 8) zin.push('Onverharde paden zijn ' + bw.woord + '.');
      } else {
        zin.push(b <= 2 ? 'Wind speelt nauwelijks een rol.' : 'De wind komt uit het ' + richting + ' met kracht ' + b +
          (gust >= 50 ? ' en stoten tot ' + Math.round(gust / 5) * 5 + ' km/u' : '') + (b >= 5 ? ': tegenwind wordt zwaar' : b === 4 ? ': tegenwind voel je goed' : '') + '.');
        zin.push('Het is ' + Math.round(temp) + ' graden' + (temp - feel >= 2.5 ? ', op de fiets voelt het als ' + Math.round(feel) : '') + '.');
      }
      if (best && best.sc - score > 0.8) zin.push('Beste moment: tussen ' + new Date(best.t).getUTCHours() + ' en ' + new Date(best.t + 2 * HOUR).getUTCHours() + ' uur.');
      facts = [['Regen', F.mm(rain) + ' mm'], ['Wind', b + ' Bft ' + W.compass(day.dir || 0)], ['Gevoel', Math.round(wandel ? feelMin : feel) + '°'], ['Beste uur', best ? new Date(best.t).getUTCHours() + '–' + new Date(best.t + 2 * HOUR).getUTCHours() + ' u' : '–']];
    }
    return { score: Math.max(1, Math.min(10, score)), text: zin.join(' ') + onzeker, facts: facts };
  };

  /* droogvenster vanaf nu */
  W.droog = function (S) {
    var now = Date.now() + S.off, hs = S.hours.filter(function (h) { return h.t >= now - HOUR / 2 && h.t < now + 48 * HOUR; });
    var dry = function (h) { return h.rain < 0.1; }, i = 0;
    if (hs.length < 3) return '';
    if (dry(hs[0])) {
      while (i < hs.length && dry(hs[i])) i++;
      return i >= hs.length ? 'De komende twee dagen droog' : 'Droog tot ' + kloktijd(hs[i].t, now);
    }
    var a = -1;
    for (i = 1; i < hs.length - 1; i++) if (dry(hs[i]) && dry(hs[i + 1])) { a = i; break; }
    if (a < 0) return 'Voorlopig geen droog venster van 2 uur';
    var e = a; while (e < hs.length && dry(hs[e])) e++;
    return 'Droog vanaf ' + kloktijd(hs[a].t, now).replace('rond ', '') + (e < hs.length ? ', tot ' + kloktijd(hs[e].t, now) : '');
  };
})();
