import os
import sys

# Ensure root folder is in python path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app import app as flask_app

class VercelPathFixer:
    """
    Normalizes PATH_INFO so that Vercel /api/index.py/$1 rewrites
    map directly to Flask routes.
    """
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get('PATH_INFO', '')
        if path.startswith('/api/index.py/'):
            path = path[len('/api/index.py'):]
        elif path.startswith('/api/index/'):
            path = path[len('/api/index'):]
        elif path in ['/api/index.py', '/api/index', '/api', '']:
            path = '/'

        if not path.startswith('/'):
            path = '/' + path

        environ['PATH_INFO'] = path
        return self.wsgi_app(environ, start_response)

# Export app for Vercel
app = VercelPathFixer(flask_app)
