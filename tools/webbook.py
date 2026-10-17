#!/usr/bin/env python3
"""
Turn a self contained HTML document (its own styles, markup and script) into an MPH "web book".

The document keeps its own design and interactive parts, but runs inside MPH:
  * styles are scoped to the book (".wb-<id>") so they never touch the rest of the app,
  * the document's own navigation chrome is hidden (MPH provides contents, bookmarks, search),
  * the script is kept as text and started by js/webrun.js inside a small sandbox,
  * the plain text of each section is extracted for MPH's search.

Used by build_content.py. Nothing here is secret; the output is locked by build_content.py.
"""
import re, html as H


# ---------- CSS scoping ----------
def _strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)


def _split_top(s, ch=','):
    out, depth, cur, q = [], 0, '', None
    for c in s:
        if q:
            cur += c
            if c == q: q = None
            continue
        if c in '"\'': q = c; cur += c; continue
        if c in '([': depth += 1
        elif c in ')]': depth -= 1
        if c == ch and depth == 0: out.append(cur); cur = ''
        else: cur += c
    out.append(cur)
    return [x.strip() for x in out if x.strip()]


def _blocks(css):
    """Yield (prelude, body) for each top level rule; body is None for statements like @import."""
    i, n = 0, len(css)
    while i < n:
        j = i
        q = None
        while j < n and (q or css[j] not in '{;'):
            if q:
                if css[j] == q: q = None
            elif css[j] in '"\'': q = css[j]
            j += 1
        if j >= n: break
        pre = css[i:j].strip()
        if css[j] == ';':
            yield pre, None; i = j + 1; continue
        depth, k, q = 1, j + 1, None
        while k < n and depth:
            c = css[k]
            if q:
                if c == q: q = None
            elif c in '"\'': q = c
            elif c == '{': depth += 1
            elif c == '}': depth -= 1
            k += 1
        yield pre, css[j + 1:k - 1]
        i = k


ROOTISH = re.compile(r'^(:root|html|body)((?:\[[^\]]*\]|\.[\w-]+|:not\([^)]*\)|:[\w-]+)*)(.*)$', re.S)


def _scope_sel(sel, P):
    m = ROOTISH.match(sel)
    if m:
        tag, quals, rest = m.groups()
        # quals that test the app theme stay on the real page root, the rest move to the book
        theme = ''.join(x for x in re.findall(r'\[[^\]]*\]|\.[\w-]+|:not\([^)]*\)|:[\w-]+', quals) if 'data-theme' in x)
        own = ''.join(x for x in re.findall(r'\[[^\]]*\]|\.[\w-]+|:not\([^)]*\)|:[\w-]+', quals) if 'data-theme' not in x)
        base = (':root' + theme + ' ' if theme else '') + P + own
        return base + rest
    if sel.startswith('*'):
        return P + ' ' + sel if sel != '*' else P + ', ' + P + ' *'
    return P + ' ' + sel


def scope_css(css, P, kf_prefix):
    css = _strip_comments(css)
    names = re.findall(r'@(?:-webkit-)?keyframes\s+([\w-]+)', css)

    def rename_anim(body):
        for nm in names:
            body = re.sub(r'(animation(?:-name)?\s*:[^;}]*?)\b' + re.escape(nm) + r'\b', lambda m: m.group(1) + kf_prefix + nm, body)
        return body

    def walk(text):
        out = []
        for pre, body in _blocks(text):
            if body is None:
                if pre.startswith('@import') or pre.startswith('@charset'): continue
                out.append(pre + ';'); continue
            low = pre.lower()
            if low.startswith('@font-face'): continue
            if re.match(r'@(-webkit-)?keyframes', low):
                nm = pre.split()[-1]
                out.append(pre.replace(nm, kf_prefix + nm) + '{' + body + '}'); continue
            if low.startswith('@media') or low.startswith('@supports') or low.startswith('@container') or low.startswith('@layer'):
                out.append(pre + '{' + walk(body) + '}'); continue
            if low.startswith('@page') or low.startswith('@'):
                continue
            sels = _split_top(pre)
            out.append(','.join(_scope_sel(s, P) for s in sels) + '{' + rename_anim(body) + '}')
        return '\n'.join(out)
    return walk(css)


# ---------- text for search ----------
def plain(s):
    s = re.sub(r'<(script|style|svg)\b.*?</\1>', ' ', s, flags=re.S)
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', H.unescape(s)).strip()


def convert(src, bid, title, sub, sec_sel, sec_attrs, hide, extra_css='', data_text=None):
    """
    src: the html text. sec_sel: css selector of the document's sections (for example 'section.chapter').
    sec_attrs: function(attrs dict) -> dict(t, part, n) for a section. hide: selectors of the document's own chrome.
    data_text: optional function(section id) -> extra plain text (content the script draws from data) for search.
    """
    P = '.wb-' + bid
    styles = re.findall(r'<style[^>]*>(.*?)</style>', src, re.S)
    # MPH's own styles live in a cascade layer, so a reset here removes them inside the book (SVG keeps its own paint)
    css = P + ' :where(*:not(svg, svg *)){all:revert}\n' + scope_css('\n'.join(styles), P, 'wb' + bid + '_')
    hide_css = ','.join(P + ' ' + h for h in hide) + '{display:none!important}'
    css = css + '\n' + hide_css + '\n' + extra_css.replace('$P', P)
    body = src[src.index('<body'):]
    body_open = re.match(r'<body([^>]*)>', body)
    body_attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', body_open.group(1))) if body_open else {}
    body = body[body_open.end():] if body_open else body
    body = body[:body.rindex('</body>')] if '</body>' in body else body
    scripts = re.findall(r'<script(?![^>]*application/json)[^>]*>(.*?)</script>', body, re.S)
    body = re.sub(r'<script(?![^>]*application/json)[^>]*>.*?</script>', '', body, flags=re.S)
    body = re.sub(r'<!--.*?-->', '', body, flags=re.S)
    # sections, in order, with their text for search
    tag = sec_sel.split('.')[0] or 'section'
    cls = sec_sel.split('.')[1] if '.' in sec_sel else None
    sections = []
    for m in re.finditer(r'<' + tag + r'\b([^>]*)>', body):
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(1)))
        if cls and cls not in attrs.get('class', '').split(): continue
        if 'id' not in attrs: continue
        sections.append((m.start(), attrs))
    out = []
    for i, (pos, attrs) in enumerate(sections):
        end = sections[i + 1][0] if i + 1 < len(sections) else len(body)
        info = sec_attrs(attrs)
        text = plain(body[pos:end])
        if data_text: text += ' ' + (data_text(attrs['id']) or '')
        out.append({'id': attrs['id'], 't': info.get('t') or attrs['id'], 'part': info.get('part', ''), 'n': info.get('n', ''), 'x': text})
    return {'kind': 'web', 'id': bid, 'title': title, 'sub': sub, 'css': css, 'html': body.strip(), 'js': '\n'.join(scripts),
            'secSel': sec_sel, 'hide': hide, 'bodyAttrs': body_attrs, 'sections': out}
