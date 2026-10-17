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


def book():
    return json.load(open(src('book_raw.json')))


if __name__ == '__main__':
    sizes = {}
    h2, h3, bk = hsk2(), hsk3(), book()
    sizes['zh-hsk2'] = lock('zh-hsk2', h2)
    sizes['zh-hsk3'] = lock('zh-hsk3', h3)
    sizes['book-cm1'] = lock('book-cm1', bk)
    index = {
        'v': 1,
        'languages': [
            {'id': 'zh', 'name': 'Chinese', 'native': '中文', 'voice': 'zh-CN', 'levels': [
                {'id': 'hsk2', 'name': 'HSK 2', 'file': 'zh-hsk2', 'v': 1, 'size': sizes['zh-hsk2'], 'counts': {'words': len(h2['words']), 'dialogs': len(h2['dialogs']), 'grammar': len(h2['grammar'])}},
                {'id': 'hsk3', 'name': 'HSK 3', 'file': 'zh-hsk3', 'v': 1, 'size': sizes['zh-hsk3'], 'counts': {'words': len(h3['words']), 'dialogs': len(h3['dialogs']), 'grammar': len(h3['grammar'])}},
                {'id': 'hsk4', 'name': 'HSK 4', 'locked': True},
                {'id': 'hsk5', 'name': 'HSK 5', 'locked': True}]},
            {'id': 'de', 'name': 'German', 'native': 'Deutsch', 'voice': 'de-DE', 'locked': True, 'levels': []},
            {'id': 'om', 'name': 'Afaan Oromo', 'native': 'Afaan Oromoo', 'voice': 'om', 'locked': True, 'levels': []}],
        'books': [
            {'id': 'cm1', 'title': 'Corporate Management', 'sub': 'Book 1 · How companies work, from structure to strategy', 'file': 'book-cm1', 'v': 1, 'size': sizes['book-cm1'], 'chapters': len(bk['ch'])}]
    }
    lock('index', index)
    print(json.dumps(sizes), 'hsk2', len(h2['words']), len(h2['dialogs']), len(h2['grammar']), 'hsk3', len(h3['words']), len(h3['dialogs']), len(h3['grammar']), len(h3['passages']))


def pack_sources():
    """Lock the private source material too, so future sessions can rebuild from it with the key."""
    import tarfile, io
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as t:
        for name in sorted(os.listdir(SRC)):
            if name.endswith(('.txt', '_raw.json')):
                t.add(os.path.join(SRC, name), arcname=name)
    iv = os.urandom(12)
    with open(os.path.join(OUT, '_sources.bin'), 'wb') as f:
        f.write(iv + AESGCM(KEY).encrypt(iv, buf.getvalue(), None))


if __name__ == '__main__':
    pack_sources()
