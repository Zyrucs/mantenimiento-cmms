import os
import sys
from urllib.parse import parse_qsl, urlencode

# Ensure root folder is in python path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app import app as flask_app

class VercelPathFixer:
    """
    Normalizes PATH_INFO so that Vercel /api/(.*) -> /api/index.py?__path=/api/$1 rewrites
    map directly to Flask /api/... routes.
    """
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        qs = environ.get('QUERY_STRING', '')
        params = parse_qsl(qs, keep_blank_values=True)
        override_path = None
        remaining_params = []
        for k, v in params:
            if k == '__path' and override_path is None:
                override_path = v
            else:
                remaining_params.append((k, v))

        if not override_path:
            route_matches = environ.get('HTTP_X_NOW_ROUTE_MATCHES', '')
            if route_matches:
                for mk, mv in parse_qsl(route_matches):
                    if mk in ('1', 'path', '__path') and mv:
                        override_path = '/api/' + mv.lstrip('/')
                        break

        if override_path:
            if not override_path.startswith('/'):
                override_path = '/' + override_path
            if not override_path.startswith('/api/'):
                override_path = '/api' + override_path
            environ['PATH_INFO'] = override_path
            environ['QUERY_STRING'] = urlencode(remaining_params)
        else:
            path = environ.get('PATH_INFO', '')
            if path.startswith('/api/index.py/'):
                path = '/api/' + path[len('/api/index.py/'):]
            elif path in ['/api/index.py', '/api/index']:
                raw_uri = environ.get('REQUEST_URI') or environ.get('RAW_URI') or ''
                if raw_uri.startswith('/api/') and not raw_uri.startswith('/api/index'):
                    path = raw_uri.split('?')[0]
                else:
                    path = '/'
            elif path and path != '/' and not path.startswith('/api/') and not path.startswith('/static/'):
                path = '/api/' + path.lstrip('/')

            if not path.startswith('/'):
                path = '/' + path
            environ['PATH_INFO'] = path

        return self.wsgi_app(environ, start_response)

# Export app for Vercel
app = VercelPathFixer(flask_app)
