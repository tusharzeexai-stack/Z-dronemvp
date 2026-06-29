import urllib.request
import json

payload = {
    "device_id": "drone01",
    "frame_id": 4821,
    "timestamp": 1719628537528,
    "fps": 28.500000,
    "person_count": 2,
    "detections": [
        {"id": 0, "confidence": 0.872341, "x": 120, "y": 88, "w": 64, "h": 180},
        {"id": 1, "confidence": 0.913200, "x": 340, "y": 70, "w": 58, "h": 190}
    ]
}

req = urllib.request.Request(
    'http://localhost:8000/api/v1/detections',
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
try:
    res = urllib.request.urlopen(req)
    print('STATUS:', res.status)
    print('BODY:', res.read().decode())
except urllib.error.HTTPError as e:
    print('ERROR:', e.code, e.read().decode())
