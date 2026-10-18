#!/usr/bin/env python3
"""
Builds MPH as ONE self contained HTML file that opens by double click, with no server.

Why: a browser refuses to run MPH's JavaScript modules from a file on disk (file://),
which is why opening index.html directly shows a black screen. This script bundles the
modules into one script, inlines the stylesheet, the fonts, the icon and the locked
content files, and writes dist/MPH-standalone.html.

The file still signs in to Supabase (your data lives there) and unlocks books with your
login, exactly like the website. Locked content stays locked: nothing secret is added.

Usage:  python3 tools/standalone.py [path to esbuild]   (needs Node and esbuild)
"""
import base64, json, os, re, shutil, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESBUILD = sys.argv[1] if len(sys.argv) > 1 else 'esbuild'


def read(p, mode='r'):
    with open(os.path.join(ROOT, p), mode, **({} if 'b' in mode else {'encoding': 'utf-8'})) as f:
        return f.read()


def main():
    tmp = tempfile.mkdtemp()
    shutil.copytree(os.path.join(ROOT, 'js'), os.path.join(tmp, 'js'))
    # imports carry ?v= cache busters; the bundler wants plain paths
    for name in os.listdir(os.path.join(tmp, 'js')):
        p = os.path.join(tmp, 'js', name)
        if name.endswith('.js') and name != 'supabase.js':
            s = open(p, encoding='utf-8').read()
            s = re.sub(r"(from\s+'\./[\w.]+\.js)\?v=[\d.]+'", r"\1'", s)
            open(p, 'w', encoding='utf-8').write(s)
    out = os.path.join(tmp, 'bundle.js')
    subprocess.run([ESBUILD, os.path.join(tmp, 'js', 'app.js'), '--bundle', '--format=iife', '--minify', '--target=es2020', '--outfile=' + out], check=True)
    bundle = open(out, encoding='utf-8').read()

    css = read('css/app.css')
    for m in set(re.findall(r'url\(\.\./fonts/([\w.-]+\.woff2)\)', css)):
        b64 = base64.b64encode(read('fonts/' + m, 'rb')).decode()
        css = css.replace('url(../fonts/%s)' % m, 'url(data:font/woff2;base64,%s)' % b64)

    content = {}
    for name in sorted(os.listdir(os.path.join(ROOT, 'content'))):
        if name.endswith('.bin') and not name.startswith('_'):
            content[name[:-4]] = base64.b64encode(read('content/' + name, 'rb')).decode()

    version = re.search(r"version:\s*'([\d.]+)'", read('js/store.js')).group(1)
    icon = base64.b64encode(read('icons/icon-192.png', 'rb')).decode()
    # the library looks for its own script address; an inline script has none, so give it the page address
    supa = read('js/supabase.js').replace('if(!e)throw new Error("Automatic publicPath is not supported in this browser");', 'if(!e)e=location.href;')
    assert 'Automatic publicPath' not in supa or 'if(!e)e=location.href;' in supa

    # Serve content/*.bin from inside the file, so books and courses open with no server.
    prelude = """
window.MPH_STANDALONE=%s;
(function(){var C=%s;var f=window.fetch.bind(window);
window.fetch=function(u,o){var s=typeof u==='string'?u:(u&&u.url)||'';var m=/(?:^|\\/)content\\/([\\w-]+)\\.bin/.exec(s);
if(m&&C[m[1]]){var b=atob(C[m[1]]),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);
return Promise.resolve(new Response(a,{status:200,headers:{'Content-Type':'application/octet-stream'}}))}return f(u,o)}})();
""" % (json.dumps(version), json.dumps(content))

    html = """<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>MPH</title>
<meta name="description" content="My Personal Hub, standalone recovery copy %(v)s">
<meta name="theme-color" content="#000000">
<link rel="icon" type="image/png" href="data:image/png;base64,%(icon)s">
<style>%(css)s</style>
</head>
<body>
<div id="app" aria-live="polite"></div>
<div id="layer"></div>
<div id="toasts" role="status"></div>
<script>%(supa)s</script>
<script>%(prelude)s</script>
<script>%(bundle)s</script>
</body>
</html>
""" % {'v': version, 'icon': icon, 'css': css, 'supa': supa.replace('</script', '<\\/script'), 'prelude': prelude, 'bundle': bundle.replace('</script', '<\\/script')}
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    path = os.path.join(ROOT, 'dist', 'MPH-standalone.html')
    open(path, 'w', encoding='utf-8').write(html)
    shutil.rmtree(tmp)
    print('wrote', path, round(len(html) / 1e6, 2), 'MB, version', version)


if __name__ == '__main__':
    main()
