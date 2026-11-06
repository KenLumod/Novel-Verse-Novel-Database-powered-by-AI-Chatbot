import base64
import hashlib
import hmac
import json
import os
import time
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

COOKIE_NAME = "novelverse_admin"
COOKIE_MAX_AGE = 12 * 60 * 60


def admin_username() -> str:
    return os.getenv("ADMIN_USERNAME", "").strip()


def _password_hash() -> str:
    return os.getenv("ADMIN_PASSWORD_HASH", "").strip()


def _secret() -> str:
    return os.getenv("ADMIN_SECRET", "").strip()


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, rounds, salt, digest = stored.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        check = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(rounds),
        ).hex()
        return hmac.compare_digest(check, digest)
    except (ValueError, TypeError):
        return False


def credentials_match(username: str, password: str) -> bool:
    expected_user = admin_username()
    stored_hash = _password_hash()
    if not expected_user or not stored_hash or not _secret():
        return False
    user_ok = hmac.compare_digest(username.strip(), expected_user)
    pass_ok = verify_password(password, stored_hash)
    return user_ok and pass_ok


def issue_token(username: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({
        "u": username,
        "exp": int(time.time()) + COOKIE_MAX_AGE,
    }).encode("utf-8")).decode("ascii")
    signature = hmac.new(_secret().encode("utf-8"), payload.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def read_token(token: Optional[str]) -> Optional[str]:
    secret = _secret()
    expected_user = admin_username()
    if not token or not secret or not expected_user or "." not in token:
        return None
    payload, signature = token.rsplit(".", 1)
    expected = hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None
    try:
        data = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
        if int(data.get("exp", 0)) < time.time():
            return None
        username = str(data.get("u", ""))
    except (ValueError, json.JSONDecodeError, TypeError):
        return None
    if not hmac.compare_digest(username, expected_user):
        return None
    return username
