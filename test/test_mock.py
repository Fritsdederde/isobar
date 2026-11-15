"""Test Isobar op iPhone-formaat met nagebootste Open-Meteo-antwoorden (zelfde vorm als de echte API).
Gebruik: python3 test/test_mock.py [uitvoermap]"""
import json, math, random, sys, threading, http.server, functools, os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/isobar-shots'
os.makedirs(OUT, exist_ok=True)
random.seed(4)
OFF = 3600
now = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=OFF)
day0 = now.replace(hour=0, minute=0, second=0, microsecond=0)
MODELS = ['knmi_harmonie_arome_netherlands', 'icon_seamless', 'ecmwf_ifs025', 'gfs_seamless', 'meteofrance_seamless', 'ukmo_seamless']
HORIZON = {'knmi_harmonie_arome_netherlands': 60, 'icon_seamless': 180, 'ecmwf_ifs025': 360, 'gfs_seamless': 384, 'meteofrance_seamless': 96, 'ukmo_seamless': 168}

def hh(d): return d.strftime('%Y-%m-%dT%H:%M')
def dd(d): return d.strftime('%Y-%m-%d')
def temp(h, bias=0.0): return 8 - h / 60 + 3 * math.sin((h % 24 - 9) / 24 * 2 * math.pi) + 2 * math.sin(h / 50) + bias
def rain(h, k=1.0):
    v = 2.2 * math.sin(h / 9.0 + k) + 1.2 * math.sin(h / 31.0) - 1.6
    return round(max(0, v) * k, 1)

def forecast_multi(q):
    past, fd = int(q.get('past_days', ['0'])[0]), int(q['forecast_days'][0])
    n = (past + fd) * 24
    t0 = day0 - timedelta(days=past)
    hourly = {'time': [hh(t0 + timedelta(hours=i)) for i in range(n)]}
    lead0 = (now - t0).total_seconds() / 3600
    for mi, m in enumerate(MODELS):
        bias = (mi - 2.5) * 0.35
        def col(f):
            return [None if (i - lead0) > HORIZON[m] else f(i, (i - lead0)) for i in range(n)]
        grow = lambda lead: 1 + max(0, lead) / 90
        hourly['temperature_2m_' + m] = col(lambda i, l: round(temp(i, bias * grow(l)), 1))
        hourly['apparent_temperature_' + m] = col(lambda i, l: round(temp(i, bias * grow(l)) - 3.2, 1))
        hourly['precipitation_' + m] = col(lambda i, l: rain(i + mi * max(0, l) / 25, 0.8 + mi * 0.1))
        hourly['weather_code_' + m] = col(lambda i, l: 61 if rain(i) > 0.2 else 3)
        hourly['wind_speed_10m_' + m] = col(lambda i, l: round(22 + 10 * math.sin(i / 20) + mi, 1))
        hourly['wind_gusts_10m_' + m] = col(lambda i, l: round(40 + 22 * math.sin(i / 20) + mi, 1))
        hourly['wind_direction_10m_' + m] = col(lambda i, l: int(225 + 40 * math.sin(i / 40) + mi * 4) % 360)
        hourly['cloud_cover_' + m] = col(lambda i, l: int(max(0, min(100, 60 + 45 * math.sin(i / 14 + mi / 3)))))
    return {'utc_offset_seconds': OFF, 'hourly': hourly}

def nowcast():
    t0 = now.replace(minute=now.minute // 15 * 15, second=0, microsecond=0)
    r = [0, 0, 0, 0.1, 0.4, 0.9, 0.6, 0.2, 0]
    return {'utc_offset_seconds': OFF, 'minutely_15': {'time': [hh(t0 + timedelta(minutes=15 * i)) for i in range(9)], 'precipitation': r}}

def history():
    days = [day0 + timedelta(days=i) for i in range(-35, 3)]
    rr = [round(max(0, random.gauss(1.5, 4)), 1) for _ in days]
    return {'utc_offset_seconds': OFF, 'daily': {'time': [dd(d) for d in days], 'precipitation_sum': rr,
            'temperature_2m_max': [11.0] * len(days), 'temperature_2m_min': [5.0] * len(days), 'wind_speed_10m_max': [25.0] * len(days),
            'sunrise': [dd(d) + 'T07:55' for d in days], 'sunset': [dd(d) + 'T16:50' for d in days]}}

def ensemble(nd, nm):
    daily = {'time': [dd(day0 + timedelta(days=i)) for i in range(nd)]}
    for v in ['temperature_2m_mean', 'precipitation_sum', 'wind_speed_10m_mean', 'wind_direction_10m_dominant']:
        for m in range(nm + 1):
            key = v if m == 0 else '%s_member%02d' % (v, m)
            col = []
            for i in range(nd):
                sp = 0.6 + i * 0.12
                if v.startswith('temp'): x = round(9 - i * 0.22 + 1.2 * math.sin(i / 3) + random.gauss(0, sp), 1)
                elif v.startswith('prec'): x = round(max(0, random.gauss(2.4 if i < 12 else 0.9, 3)), 1)
                elif 'speed' in v: x = round(max(2, random.gauss(24 if i < 14 else 14, 3 + i * 0.15)), 1)
                else: x = int((230 if i < 14 else 50) + random.gauss(0, 30)) % 360
                col.append(x)
            daily[key] = col
    return {'utc_offset_seconds': OFF, 'daily': daily}

def archive(q):
    a, b = datetime.strptime(q['start_date'][0], '%Y-%m-%d'), datetime.strptime(q['end_date'][0], '%Y-%m-%d')
    n = (b - a).days + 1
    ds = [a + timedelta(days=i) for i in range(n)]
    doy = lambda d: d.timetuple().tm_yday
    return {'utc_offset_seconds': OFF, 'daily': {'time': [dd(d) for d in ds],
            'temperature_2m_mean': [round(10.5 - 8 * math.cos((doy(d) - 20) / 365 * 2 * math.pi) + random.gauss(0, 3), 1) for d in ds],
            'precipitation_sum': [round(max(0, random.gauss(1.2, 3.5)), 1) for d in ds],
            'wind_speed_10m_mean': [round(max(3, random.gauss(17, 6)), 1) for d in ds]}}

def prev_runs():
    t0 = day0 - timedelta(days=30); n = 31 * 24
    hourly = {'time': [hh(t0 + timedelta(hours=i)) for i in range(n)]}
    for mi, m in enumerate(MODELS):
        hourly['temperature_2m_previous_day1_' + m] = [round(temp(i - 720) + random.gauss(0, 0.5 + mi * 0.25), 1) for i in range(n)]
        hourly['precipitation_previous_day1_' + m] = [round(max(0, rain(i - 720) + random.gauss(0, 0.1 + mi * 0.08)), 1) for i in range(n)]
    return {'utc_offset_seconds': OFF, 'hourly': hourly}

def truth():
    t0 = day0 - timedelta(days=30); n = 31 * 24
    return {'utc_offset_seconds': OFF, 'hourly': {'time': [hh(t0 + timedelta(hours=i)) for i in range(n)],
            'temperature_2m': [round(temp(i - 720), 1) for i in range(n)], 'precipitation': [rain(i - 720) for i in range(n)]}}

def pressure(q):
    la, lo = [float(x) for x in q['latitude'][0].split(',')], [float(x) for x in q['longitude'][0].split(',')]
    t0 = (now - timedelta(seconds=OFF)).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=7)
    n = 18 * 8
    times = [hh(t0 + timedelta(hours=3 * i)) for i in range(n)]
    out = []
    for a, o in zip(la, lo):
        col = []
        for f in range(n):
            lx, ly = -18 + f * 0.28, 60 - f * 0.03      # lagedrukkern trekt naar het oosten
            hx, hy = 10 - f * 0.05, 44 + f * 0.02
            dl = ((o - lx) * 0.6) ** 2 + (a - ly) ** 2; dh = ((o - hx) * 0.6) ** 2 + (a - hy) ** 2
            col.append(round(1013 - 30 * math.exp(-dl / 90) + 18 * math.exp(-dh / 160) + 3 * math.sin(o / 6 + f / 9), 1))
        out.append({'latitude': a, 'longitude': o, 'hourly': {'time': times, 'pressure_msl': col}})
    return out

def handle(route):
    u = urlparse(route.request.url); q = parse_qs(u.query); host = u.netloc
    if 'fonts.g' in host: return route.abort()
    if host == 'seasonal-api.open-meteo.com': body = ensemble(46, 50)
    elif host == 'ensemble-api.open-meteo.com': body = ensemble(35, 30)
    elif host == 'archive-api.open-meteo.com': body = archive(q)
    elif host == 'previous-runs-api.open-meteo.com': body = prev_runs()
    elif host == 'geocoding-api.open-meteo.com': body = {'results': [{'name': 'Rotterdam', 'admin1': 'Zuid-Holland', 'country': 'Nederland', 'latitude': 51.92, 'longitude': 4.48}]}
    elif 'pressure_msl' in u.query: body = pressure(q)
    elif 'minutely_15' in u.query: body = nowcast()
    elif 'daily' in q: body = history()
    elif 'models' in q: body = forecast_multi(q)
    else: body = truth()
    route.fulfill(status=200, content_type='application/json', body=json.dumps(body))

srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
base = 'http://127.0.0.1:%d/' % srv.server_address[1]

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, service_workers='block')
    page = ctx.new_page()
    errs = []
    page.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    page.route('**/*open-meteo.com/**', handle)
    page.route('**/fonts.g*/**', lambda r: r.abort())
    page.goto(base + 'index.html')
    page.wait_for_selector('.drow', timeout=20000)
    page.wait_for_selector('.wbars', timeout=20000)
    page.wait_for_selector('#s-6w .chart', timeout=20000)
    page.wait_for_timeout(1500)
    page.screenshot(path=OUT + '/1-nu.png')
    info = page.evaluate('''() => ({scrollTop: document.getElementById('scroll').scrollTop, nuTop: document.getElementById('s-nu').offsetTop,
        over: [...document.querySelectorAll('#scroll *')].filter(e => e.getBoundingClientRect().right > 391 && !e.closest('.hstrip,.mscroll,.chips')).slice(0,8).map(e => e.className || e.tagName),
        errors: W.S.errors, talk: document.querySelector('.talk').textContent, lijn: document.querySelector('#s-6w .talk').textContent})''')
    print(json.dumps(info, ensure_ascii=False, indent=1))
    def shot(name, sel, dy=-70):
        page.evaluate('''([s, dy]) => { const sc = document.getElementById('scroll'); const el = document.querySelector(s); sc.scrollTop = el.getBoundingClientRect().top + sc.scrollTop + dy; }''', [sel, dy])
        page.wait_for_timeout(700); page.screenshot(path=OUT + '/' + name + '.png')
    shot('2-nu-kaarten', '.card')
    shot('3-buiten', '#buiten')
    page.locator('.chips button').nth(2).click(); page.wait_for_timeout(200)
    for act in ['fiets', 'wandel', 'mtb', 'paard']:
        page.click('button[data-act="%s"]' % act); page.wait_for_timeout(200)
        print(act, '→', page.evaluate("document.querySelector('.act').innerText"))
    page.screenshot(path=OUT + '/3b-paard.png')
    shot('4-14dagen', '#s-14')
    shot('5-6weken', '#s-6w')
    shot('5b-6weken', '#s-6w .card:nth-of-type(3)')
    shot('6-modellen', '#s-mod')
    shot('7-terug', '#s-terug')
    shot('7b-terug', '#s-terug .card:nth-of-type(2)')
    page.click('#mapBtn'); page.wait_for_timeout(900); page.screenshot(path=OUT + '/8-kaart.png')
    page.click('#mapClose'); page.click('#locBtn'); page.wait_for_timeout(300); page.screenshot(path=OUT + '/9-locaties.png')
    print('CONSOLE:', errs[:10])
    # iconen als PNG
    ip = ctx.new_page()
    for s in (180, 192, 512):
        ip.set_viewport_size({'width': s, 'height': s})
        ip.goto(base + 'icons/icon.svg'); ip.screenshot(path=ROOT + '/icons/icon-%d.png' % s, clip={'x': 0, 'y': 0, 'width': s, 'height': s})
    br.close()
