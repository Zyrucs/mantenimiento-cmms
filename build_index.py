import os
import re

base_dir = os.path.dirname(os.path.abspath(__file__))

template_path = os.path.join(base_dir, 'templates', 'index.html')
css_path = os.path.join(base_dir, 'static', 'css', 'custom.css')
js_path = os.path.join(base_dir, 'static', 'js', 'app.js')
root_index_path = os.path.join(base_dir, 'index.html')

with open(template_path, 'r', encoding='utf-8') as f:
    html = f.read()

with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

with open(js_path, 'r', encoding='utf-8') as f:
    js = f.read()

# Inline CSS via markers or link tag
css_block = f"<!-- INLINE_CSS_START -->\n    <style>\n{css}\n    </style>\n    <!-- INLINE_CSS_END -->"
if '<!-- INLINE_CSS_START -->' in html:
    html = re.sub(r'<!-- INLINE_CSS_START -->.*?<!-- INLINE_CSS_END -->', lambda m: css_block, html, flags=re.DOTALL)
else:
    html = html.replace('<link rel="stylesheet" href="/static/css/custom.css">', css_block)

# Inline JS via markers or script tag
js_block = f"<!-- INLINE_JS_START -->\n    <script>\n{js}\n    </script>\n    <!-- INLINE_JS_END -->"
if '<!-- INLINE_JS_START -->' in html:
    html = re.sub(r'<!-- INLINE_JS_START -->.*?<!-- INLINE_JS_END -->', lambda m: js_block, html, flags=re.DOTALL)
else:
    html = html.replace('<script src="/static/js/app.js"></script>', js_block)

with open(root_index_path, 'w', encoding='utf-8') as f:
    f.write(html)

with open(template_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("SUCCESS: index.html and templates/index.html built with inlined v2 assets!")
