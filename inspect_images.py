import os
import base64
import re
from PIL import Image

with open('web/app/icon.svg', 'r', encoding='utf-8') as f:
    svg = f.read()

m = re.search(r'base64,([a-zA-Z0-9+/=]+)', svg)
if m:
    data = base64.b64decode(m.group(1))
    with open('svg_extracted.png', 'wb') as out:
        out.write(data)
    im = Image.open('svg_extracted.png')
    print('SVG embedded image:', im.size, im.format, im.mode)

for name in ['web/app/icon.png', 'web/app/apple-icon.png', 'web/public/images/apex-vouchers-logo.png']:
    if os.path.exists(name):
        im2 = Image.open(name)
        print(name, im2.size, im2.format, im2.mode)
