#!/usr/bin/env python3
"""Unlock content/_sources.bin into a private folder: MPH_KEY=... python3 tools/unpack_sources.py /tmp/somewhere"""
import os, sys, io, base64, tarfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
key = base64.b64decode(os.environ['MPH_KEY'])
data = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content', '_sources.bin'), 'rb').read()
raw = AESGCM(key).decrypt(data[:12], data[12:], None)
out = sys.argv[1]
os.makedirs(out, exist_ok=True)
tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz').extractall(out)
print('unpacked to', out)
