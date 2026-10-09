import os
import base64
import requests
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.utils import secure_filename

load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB max upload
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(__file__), 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff'}

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

WHATFONTIS_API_KEY = os.getenv('WHATFONTIS_API_KEY', '')
WHATFONTIS_API_URL = 'https://www.whatfontis.com/api2/'


def allowed_file(filename):
    """Check if the uploaded file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    """Serve the main page."""
    return render_template('index.html')


@app.route('/api/identify', methods=['POST'])
def identify_font():
    """Identify font from an uploaded image using WhatFontIs API."""
    # Check for API key
    if not WHATFONTIS_API_KEY or WHATFONTIS_API_KEY == 'your_api_key_here':
        return jsonify({
            'success': False,
            'error': 'API key not configured. Please set WHATFONTIS_API_KEY in your .env file.',
            'demo_mode': True,
            'fonts': [
                {
                    'title': 'Roboto (Demo)',
                    'author': 'Google',
                    'url': 'https://fonts.google.com/specimen/Roboto',
                    'similarity': 95,
                    'is_free': True,
                    'sample_url': ''
                },
                {
                    'title': 'Open Sans (Demo)',
                    'author': 'Steve Matteson',
                    'url': 'https://fonts.google.com/specimen/Open+Sans',
                    'similarity': 88,
                    'is_free': True,
                    'sample_url': ''
                },
                {
                    'title': 'Helvetica Neue (Demo)',
                    'author': 'Linotype',
                    'url': 'https://www.myfonts.com/fonts/linotype/neue-helvetica/',
                    'similarity': 82,
                    'is_free': False,
                    'sample_url': ''
                }
            ]
        }), 200

    # Validate file
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No image file provided.'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected.'}), 400

    if not allowed_file(file.filename):
        return jsonify({
            'success': False,
            'error': f'Invalid file type. Allowed types: {", ".join(ALLOWED_EXTENSIONS)}'
        }), 400

    try:
        # Read and encode the image
        image_data = file.read()
        image_base64 = base64.b64encode(image_data).decode('utf-8')

        # Determine MIME type
        ext = file.filename.rsplit('.', 1)[1].lower()
        mime_map = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
            'tiff': 'image/tiff'
        }
        mime_type = mime_map.get(ext, 'image/png')

        # Call WhatFontIs API
        payload = {
            'API_KEY': WHATFONTIS_API_KEY,
            'IMAGEBASE64': f'data:{mime_type};base64,{image_base64}',
            'NOTTEXTALIASED': 0,
            'LIMIT': 10
        }

        response = requests.post(WHATFONTIS_API_URL, data=payload, timeout=30)

        if response.status_code != 200:
            return jsonify({
                'success': False,
                'error': f'Font API returned status {response.status_code}. Please try again.'
            }), 502

        api_result = response.json()

        # Handle API error responses
        if isinstance(api_result, dict) and api_result.get('error'):
            return jsonify({
                'success': False,
                'error': api_result.get('error', 'Unknown API error')
            }), 400

        # Parse results
        fonts = []
        if isinstance(api_result, list):
            for item in api_result:
                font = {
                    'title': item.get('title', 'Unknown Font'),
                    'author': item.get('author', 'Unknown'),
                    'url': item.get('url', '#'),
                    'similarity': item.get('precent', item.get('percent', 0)),
                    'is_free': str(item.get('free', '0')) == '1',
                    'sample_url': item.get('sample', item.get('sample_url', ''))
                }
                fonts.append(font)

        return jsonify({
            'success': True,
            'fonts': fonts,
            'total': len(fonts)
        })

    except requests.exceptions.Timeout:
        return jsonify({
            'success': False,
            'error': 'Font identification request timed out. Please try again.'
        }), 504
    except requests.exceptions.RequestException as e:
        return jsonify({
            'success': False,
            'error': f'Failed to connect to font identification service: {str(e)}'
        }), 502
    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'An unexpected error occurred: {str(e)}'
        }), 500


@app.route('/api/health')
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'api_key_configured': bool(WHATFONTIS_API_KEY and WHATFONTIS_API_KEY != 'your_api_key_here')
    })


if __name__ == '__main__':
    print('\nFont Recognizer is running!')
    print('   Open http://localhost:5000 in your browser\n')
    if not WHATFONTIS_API_KEY or WHATFONTIS_API_KEY == 'your_api_key_here':
        print('   WARNING: No API key configured - running in DEMO MODE')
        print('   Set WHATFONTIS_API_KEY in .env for real font identification\n')
    app.run(debug=True, host='0.0.0.0', port=5000)
