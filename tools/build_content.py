#!/usr/bin/env python3
"""
MPH private content builder.

Turns source material into the app's content format, compresses it and locks it with
AES-256-GCM. The key is NOT stored in this repository. It lives only in Yotham's
Supabase database (table mph_keys) and is passed in with the MPH_KEY environment variable:

  MPH_KEY=... python3 tools/build_content.py <source folder>

Each output file in content/ is: 12 byte IV + ciphertext (gzip of JSON) + 16 byte tag.
Without the key the files are unreadable.
"""
import os, sys, json, gzip, base64, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content')
KEY = base64.b64decode(os.environ['MPH_KEY'])
os.makedirs(OUT, exist_ok=True)


def lock(name, obj):
    raw = gzip.compress(json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), 9)
    iv = os.urandom(12)
    ct = AESGCM(KEY).encrypt(iv, raw, None)
    with open(os.path.join(OUT, name + '.bin'), 'wb') as f:
        f.write(iv + ct)
    return len(iv + ct)


def src(p):
    return os.path.join(SRC, p)


# Chinese HSK 2, converted from the Tingdong lab data
def hsk2():
    d = json.load(open(src('hsk2_raw.json')))
    words = []
    for line in d['VRAW'].strip().split('\n'):
        f = line.split('|')
        if len(f) < 9: continue
        words.append({'id': 'w2:' + f[0], 'h': f[0], 'p': f[1], 'pos': f[2], 'm': f[3], 'topic': f[4], 'col': f[5], 'ex': {'h': f[6], 'p': f[7], 'e': f[8]}})
    for w in d.get('H3', []):
        pass
    sentences = []
    for line in d['SRAW'].strip().split('\n'):
        f = line.split('|')
        if len(f) >= 3: sentences.append({'h': f[0], 'p': f[1], 'e': f[2]})
    dialogs = []
    for i, g in enumerate(d['DLG']):
        dialogs.append({'id': 'd2:%d' % i, 't': g['t'], 'te': g['t'], 'lines': [{'s': l[0], 'h': l[1], 'p': l[2], 'e': l[3]} for l in g['l']],
                        'q': [{'qh': q[0], 'qe': q[1], 'o': q[2], 'a': q[3]} for q in g.get('q', [])]})
    passages = []
    for i, g in enumerate(d['PAS']):
        passages.append({'id': 'p2:%d' % i, 't': g['t'], 'te': g['t'], 'lines': [{'h': l[0], 'p': l[1], 'e': l[2]} for l in g['l']],
                         'q': [{'qh': q[0], 'qe': q[1], 'o': q[2], 'a': q[3]} for q in g.get('q', [])]})
    grammar = []
    for i, g in enumerate(d['GRAM']):
        grammar.append({'id': 'g2:%d' % i, 't': g['t'], 'p': g['p'], 'm': g['m'], 'h': g.get('h', ''), 'x': g.get('x', ''),
                        'ex': [{'h': e[0], 'p': e[1], 'e': e[2]} for e in g.get('e', [])]})
    return {'id': 'hsk2', 'lang': 'zh', 'name': 'HSK 2', 'words': words, 'grammar': grammar, 'dialogs': dialogs, 'passages': passages, 'sentences': sentences}


# Chinese HSK 3, written for MPH
def blocks(text):
    out, cur = [], None
    for line in text.split('\n'):
        line = line.rstrip()
        if not line: continue
        if line.startswith('# '):
            cur = {'head': line[2:], 'rows': [], 'q': []}
            out.append(cur)
        elif line.startswith('?'):
            cur['q'].append(line[1:])
        else:
            cur['rows'].append(line)
    return out


def hsk3():
    words = []
    for part in ['a', 'b', 'c']:
        for line in open(src('hsk3_words_%s.txt' % part)).read().strip().split('\n'):
            f = line.split('|')
            words.append({'id': 'w3:' + f[0], 'h': f[0], 'p': f[1], 'pos': f[2], 'm': f[3], 'topic': f[4], 'ex': {'h': f[5], 'p': f[6], 'e': f[7]}})

    def q(lines):
        res = []
        for x in lines:
            f = x.split('|')
            res.append({'qh': f[0], 'qe': f[1], 'o': f[2].split(';'), 'a': int(f[3])})
        return res

    dialogs = []
    for i, b in enumerate(blocks(open(src('hsk3_dialogs.txt')).read())):
        zh, en = b['head'].split('|')
        lines = []
        for r in b['rows']:
            f = r.split('|')
            lines.append({'s': f[0], 'h': f[1], 'p': f[2], 'e': f[3]})
        dialogs.append({'id': 'd3:%d' % i, 't': zh, 'te': en, 'lines': lines, 'q': q(b['q'])})
    passages = []
    for i, b in enumerate(blocks(open(src('hsk3_passages.txt')).read())):
        zh, en = b['head'].split('|')
        lines = [dict(zip(['h', 'p', 'e'], r.split('|'))) for r in b['rows']]
        passages.append({'id': 'p3:%d' % i, 't': zh, 'te': en, 'lines': lines, 'q': q(b['q'])})
    grammar = []
    for i, b in enumerate(blocks(open(src('hsk3_grammar.txt')).read())):
        t, p, m, h, x = b['head'].split('|')
        ex = [dict(zip(['h', 'p', 'e'], r.split('|'))) for r in b['rows']]
        grammar.append({'id': 'g3:%d' % i, 't': t, 'p': p, 'm': m, 'h': h, 'x': x, 'ex': ex})
    return {'id': 'hsk3', 'lang': 'zh', 'name': 'HSK 3', 'words': words, 'grammar': grammar, 'dialogs': dialogs, 'passages': passages, 'sentences': []}


# Levels written as plain text files (German A1, Afaan Oromo level 1, and future levels).
# prefix_words*.txt   h|forms|pos|meaning|topic|example|example romanised (empty)|example English
# prefix_dialogs.txt  # title|English title, then speaker|line|romanised|English, then ?question|English|a;b;c;d|answer
# prefix_passages.txt # title|English title, then line|romanised|English, then questions
# prefix_grammar.txt  # title|pattern|meaning|how|mistake, then example|romanised|English
# prefix_exercises.txt # title|grammar point|intro, then ?question|hint|a;b;c|answer|why|audio or =question|hint|answer;also accepted|why|audio
def textlevel(prefix, lid, name, tag):
    import glob
    words = []
    for f in sorted(glob.glob(src(prefix + '_words*.txt'))):
        for line in open(f, encoding='utf-8').read().strip().split('\n'):
            x = line.split('|')
            if len(x) < 8: continue
            words.append({'id': tag + 'w:' + x[0], 'h': x[0], 'p': x[1], 'pos': x[2], 'm': x[3], 'topic': x[4], 'ex': {'h': x[5], 'p': x[6], 'e': x[7]}})

    def qs(lines):
        out = []
        for x in lines:
            f = x.split('|')
            out.append({'qh': f[0], 'qe': f[1], 'o': f[2].split(';'), 'a': int(f[3])})
        return out

    def rd(name):
        p = src(prefix + '_' + name + '.txt')
        return open(p, encoding='utf-8').read() if os.path.exists(p) else ''
    dialogs = []
    for i, b in enumerate(blocks(rd('dialogs'))):
        t, te = b['head'].split('|')
        dialogs.append({'id': tag + 'd:%d' % i, 't': t, 'te': te, 'lines': [dict(zip(['s', 'h', 'p', 'e'], r.split('|'))) for r in b['rows']], 'q': qs(b['q'])})
    passages = []
    for i, b in enumerate(blocks(rd('passages'))):
        t, te = b['head'].split('|')
        passages.append({'id': tag + 'p:%d' % i, 't': t, 'te': te, 'lines': [dict(zip(['h', 'p', 'e'], r.split('|'))) for r in b['rows']], 'q': qs(b['q'])})
    grammar = []
    for i, b in enumerate(blocks(rd('grammar'))):
        t, p_, m, h, x = b['head'].split('|')
        grammar.append({'id': tag + 'g:%d' % i, 't': t, 'p': p_, 'm': m, 'h': h, 'x': x, 'ex': [dict(zip(['h', 'p', 'e'], r.split('|'))) for r in b['rows']]})
    exercises = []
    cur = None
    for line in rd('exercises').split('\n'):
        line = line.rstrip()
        if not line: continue
        if line.startswith('# '):
            t, g, intro = (line[2:].split('|') + ['', ''])[:3]
            cur = {'id': tag + 'x:%d' % len(exercises), 't': t, 'g': g, 'intro': intro, 'items': []}; exercises.append(cur)
        elif line.startswith('?'):
            f = line[1:].split('|')
            cur['items'].append({'q': f[0], 'qe': f[1], 'o': f[2].split(';'), 'a': int(f[3]), 'e': f[4] if len(f) > 4 else '', 'h': f[5] if len(f) > 5 else ''})
        elif line.startswith('='):
            f = line[1:].split('|')
            cur['items'].append({'q': f[0], 'qe': f[1], 'a': f[2].split(';'), 'e': f[3] if len(f) > 3 else '', 'h': f[4] if len(f) > 4 else ''})
    return {'id': lid, 'name': name, 'words': words, 'grammar': grammar, 'dialogs': dialogs, 'passages': passages, 'sentences': [], 'exercises': exercises}


def book():
    return json.load(open(src('book_raw.json')))


# Library books that keep their own design and interactive tools (see tools/webbook.py)
from webbook import convert as web_convert, plain as web_plain


def coffee():
    html = open(src('coffee.html'), encoding='utf-8').read()
    D = {}
    for m in re.finditer(r'<script type="application/json" id="d\d">(.*?)</script>', html, re.S): D.update(json.loads(m.group(1)))
    flat = lambda v: web_plain(json.dumps(v, ensure_ascii=False).replace('"', ' ').replace('[', ' ').replace(']', ' ').replace('{', ' ').replace('}', ' '))
    where = {'c04': ['origins'], 'c05': ['proc'], 'c15': ['inc', 'incStages'], 'c18': ['docs'], 'c23': ['mkt'], 'c24': ['sup'], 'c25': ['buy', 'bdd'],
             'c26': ['bq'], 'c27': ['neg'], 'c28': ['sim'], 'c30': ['offer'], 'c31': ['spec'], 'c32': ['g'], 'c34': ['prep']}
    extra = """
$P main{margin-left:0!important;min-width:0}
$P{background:var(--paper);color:var(--ink);font-family:var(--f);font-size:16.5px;line-height:1.62}
$P section.chapter,$P header.cover{scroll-margin-top:124px}
$P .chapter.closed .ch-body{display:block!important}
"""
    return web_convert(html, 'coffee', 'Coffee Sourcing and Export Intelligence', 'Mansen manual · Buying Ethiopian green coffee and selling it to Europe, China and Russia',
                       'section.chapter', lambda a: {'t': a.get('data-title'), 'part': a.get('data-part'), 'n': a.get('data-num')},
                       ['.side', '.crumb', '.totop', '.ch-tools', '.results'], extra, lambda sid: ' '.join(flat(D[k]) for k in where.get(sid, []) if k in D))


def dahua():
    html = open(src('dahua.html'), encoding='utf-8').read()
    extra = """
$P{padding:0!important;background:#fff;color:#000;font-family:var(--font);font-size:16px;line-height:1.55;--hd:0px;--ft:0px}
$P section.s{scroll-margin-top:124px}
"""
    return web_convert(html, 'dahua', 'The Intelligent District', 'Mansen and Dahua · Connected infrastructure, one operational picture',
                       'section.s', lambda a: {'t': a.get('data-title'), 'part': 'Executive story' if a.get('data-story') == '1' else 'Deep dive'},
                       ['header.band.top', 'footer.band.bot', '#index', '#back'], extra)


if __name__ == '__main__':
    sizes = {}
    h2, h3, bk = hsk2(), hsk3(), book()
    sizes['zh-hsk2'] = lock('zh-hsk2', h2)
    sizes['zh-hsk3'] = lock('zh-hsk3', h3)
    sizes['book-cm1'] = lock('book-cm1', bk)
    de1 = textlevel('de_a1', 'a1', 'A1', 'de1')
    om1 = textlevel('om_l1', 'l1', 'Level 1', 'om1')
    sizes['de-a1'] = lock('de-a1', de1)
    sizes['om-l1'] = lock('om-l1', om1)
    cf, dh = coffee(), dahua()
    sizes['book-coffee'] = lock('book-coffee', cf)
    sizes['book-dahua'] = lock('book-dahua', dh)
    index = {
        'v': 1,
        'languages': [
            {'id': 'zh', 'name': 'Chinese', 'native': '中文', 'voice': 'zh-CN', 'levels': [
                {'id': 'hsk2', 'name': 'HSK 2', 'file': 'zh-hsk2', 'v': 1, 'size': sizes['zh-hsk2'], 'counts': {'words': len(h2['words']), 'dialogs': len(h2['dialogs']), 'grammar': len(h2['grammar'])}},
                {'id': 'hsk3', 'name': 'HSK 3', 'file': 'zh-hsk3', 'v': 1, 'size': sizes['zh-hsk3'], 'counts': {'words': len(h3['words']), 'dialogs': len(h3['dialogs']), 'grammar': len(h3['grammar'])}},
                {'id': 'hsk4', 'name': 'HSK 4', 'locked': True},
                {'id': 'hsk5', 'name': 'HSK 5', 'locked': True}]},
            {'id': 'de', 'name': 'German', 'native': 'Deutsch', 'voice': 'de-DE',
             'ui': {'script': 'Deutsch', 'roman': None, 'recall': 'Say or write it in German', 'hear': 'Choose the word you hear', 'search': 'Search German or English', 'latin': True, 'reading': True},
             'levels': [
                {'id': 'a1', 'name': 'A1', 'file': 'de-a1', 'v': 1, 'size': sizes['de-a1'], 'counts': {'words': len(de1['words']), 'dialogs': len(de1['dialogs']), 'grammar': len(de1['grammar'])}},
                {'id': 'a2', 'name': 'A2', 'locked': True},
                {'id': 'b1', 'name': 'B1', 'locked': True}]},
            {'id': 'om', 'name': 'Afaan Oromo', 'native': 'Afaan Oromoo', 'voice': 'om-ET',
             'ui': {'script': 'Oromoo', 'roman': None, 'recall': 'Say or write it in Afaan Oromo', 'hear': 'Choose the word you hear', 'search': 'Search Afaan Oromo or English', 'latin': True, 'reading': True, 'noaudio': True,
                    'novoice': 'Phones and Macs have no Afaan Oromo voice yet, so read the lines aloud yourself.'},
             'note': 'Level 1 is written in standard Qubee spelling. Practise speaking with a native speaker, who can also confirm pronunciation.',
             'levels': [
                {'id': 'l1', 'name': 'Level 1', 'file': 'om-l1', 'v': 1, 'size': sizes['om-l1'], 'counts': {'words': len(om1['words']), 'dialogs': len(om1['dialogs']), 'grammar': len(om1['grammar'])}},
                {'id': 'l2', 'name': 'Level 2', 'locked': True}]}],
        'books': [
            {'id': 'cm1', 'title': 'Corporate Management', 'sub': 'Book 1 · How companies work, from structure to strategy', 'file': 'book-cm1', 'v': 1, 'size': sizes['book-cm1'], 'chapters': len(bk['ch']), 'kind': 'study', 'tone': 'green'},
            {'id': 'coffee', 'title': cf['title'], 'sub': cf['sub'], 'file': 'book-coffee', 'v': 1, 'size': sizes['book-coffee'], 'chapters': len(cf['sections']), 'kind': 'web', 'tone': 'coffee'},
            {'id': 'dahua', 'title': dh['title'], 'sub': dh['sub'], 'file': 'book-dahua', 'v': 1, 'size': sizes['book-dahua'], 'chapters': len(dh['sections']), 'kind': 'web', 'tone': 'light'}]
    }
    lock('index', index)
    print(json.dumps(sizes), 'hsk2', len(h2['words']), len(h2['dialogs']), len(h2['grammar']), 'hsk3', len(h3['words']), len(h3['dialogs']), len(h3['grammar']), len(h3['passages']))


def pack_sources():
    """Lock the private source material too, so future sessions can rebuild from it with the key."""
    import tarfile, io
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as t:
        for name in sorted(os.listdir(SRC)):
            if name.endswith(('.txt', '_raw.json', '.html')):
                t.add(os.path.join(SRC, name), arcname=name)
    iv = os.urandom(12)
    with open(os.path.join(OUT, '_sources.bin'), 'wb') as f:
        f.write(iv + AESGCM(KEY).encrypt(iv, buf.getvalue(), None))


if __name__ == '__main__':
    pack_sources()
