import os

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

# Inline CSS
css_tag = f"<style>\n{css}\n</style>"
html = html.replace('<link rel="stylesheet" href="/static/css/custom.css">', css_tag)

# Inline JS
js_tag = f"<script>\n{js}\n</script>"
html = html.replace('<script src="/static/js/app.js"></script>', js_tag)

with open(root_index_path, 'w', encoding='utf-8') as f:
    f.write(html)

with open(template_path, 'w', encoding='utf-8') as f:
    f.write(html)

print("SUCCESS: index.html created at root and templates with inlined assets!")
