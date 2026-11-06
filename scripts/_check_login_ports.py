import json
import os
import urllib.error
import urllib.request

password = os.environ["ADMIN_PLAIN"]
body = json.dumps({"username": "kenlumod", "password": password}).encode()
for port in (8000, 8001):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api/admin/login",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            cookie = res.headers.get("Set-Cookie", "")
            print(port, res.status, res.read().decode(), "set_cookie", bool(cookie), "httponly", "httponly" in cookie.lower())
    except urllib.error.HTTPError as e:
        print(port, "HTTP", e.code, e.read()[:200])
