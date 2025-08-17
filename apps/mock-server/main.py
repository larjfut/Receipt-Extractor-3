import os
from flask import Flask, jsonify
from time import sleep

app = Flask(__name__)

@app.get('/api/health')
def health():
    return jsonify(ok=True)

@app.post('/api/upload')
def upload():
    # pretend OCR
    sleep(1)
    return jsonify({
        "results": [{"file": "demo.png", "data": {"vendor": "Demo Store", "total": "12.34", "transactionDate": "2024-01-01"}}],
        "fields": {"vendor": "Demo Store", "total": "12.34", "transactionDate": "2024-01-01"},
        "batchId": "mock-batch-1"
    })

@app.post('/api/submit')
def submit():
    sleep(1)
    return jsonify({"ok": True, "itemId": "mock-1234"})

if __name__ == '__main__':
    # Only enable debug in development environment
    debug_mode = os.getenv('FLASK_ENV', 'production') == 'development'
    app.run(port=5001, debug=debug_mode)
