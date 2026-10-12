"""
Vercel serverless entrypoint for Flask app
Handles WSGI path normalization so that Vercel rewrites do not cause Flask 404 errors.
"""
import os
import sys

# Ensure root folder is in python path
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from app import app as flask_app

class VercelPathFixer:
    """
    WSGI Middleware to fix PATH_INFO on Vercel.
    When Vercel rewrites /(.*) to /api/index.py, PATH_INFO might become /api/index.py.
    This middleware restores the original requested path from HTTP_X_MATCHED_PATH or strips the prefix.
    """
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        # 1. Check if Vercel set the real matched path
        matched_path = environ.get('HTTP_X_MATCHED_PATH') or environ.get('HTTP_X_NOW_ROUTE_MATCHES')
        if matched_path:
            environ['PATH_INFO'] = matched_path
        else:
            path = environ.get('PATH_INFO', '')
            if path == '/api/index.py' or path == '/api/index' or path == '/api':
                environ['PATH_INFO'] = '/'
            elif path.startswith('/api/index.py/'):
                environ['PATH_INFO'] = path[len('/api/index.py'):]
            elif path.startswith('/api/index/'):
                environ['PATH_INFO'] = path[len('/api/index'):]

        return self.wsgi_app(environ, start_response)

# Export app for Vercel
app = VercelPathFixer(flask_app)
