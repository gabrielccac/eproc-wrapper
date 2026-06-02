import base64
import json
import os
import sys
import time
from urllib.parse import unquote

import pyotp
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


EPROC_URL = "https://eproc.jfrs.jus.br/eprocV2/externo_controlador.php"
FIRST_CAPTCHA_URL = "https://eproc.jfrs.jus.br/eprocV2/externo_controlador.php?acao=principal&acao_retorno=login"
SECOND_CAPTCHA_URL = "https://eproc.jfrs.jus.br/eprocV2/index.php"
PANEL_URL_CONTAINS = "acao=painel_adv_listar"
PANEL_READY_SELECTOR = 'a[aria-describedby="processoscomprazoemaberto"]'
LOCAL_USUARIO = "RS061216"
LOCAL_SENHA = "Magras2130@@"
OTP_EXPORT_DATA = "Ck8KFDAyMzIwZjZmMmVlZjg2M2Q0NmQ1EhBFbGlzYW5kcmEgQmVja2VyGgpFcHJvYy9USlJTIAEoATACQhM0NmFjNjExNzI3NzI4OTk0MDIyCk8KFGYzZDQyZTQxYjM2YmZiMTlkZmRiEhBFbGlzYW5kcmEgQmVja2VyGgpFcHJvYy9UUkY0IAEoATACQhMxOTM5MDQxNzMxNDE5MDc3MzQ5ClAKFDYxODI4ZTA2OWMxNDQwM2E0MDhmEhFFbGlzYW5kcmEgIEJlY2tlchoKRXByb2MvVEpTQyABKAEwAkITOGI4NzczMTc1NTg4OTk1Nzk4NxACGAEgAA=="
OTP_PROFILE_MATCH = "TRF4"
OTP_PROFILE_INDEX = 1  # Optional 0-based fallback index (e.g. 1 for second item)


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def decode_migration_data(data: str) -> list[dict]:
    decoded = base64.b64decode(data)
    accounts: list[dict] = []
    i = 0

    while i < len(decoded):
        if decoded[i] != 0x0A:
            i += 1
            continue

        i += 1
        if i >= len(decoded):
            break

        account_len = decoded[i]
        i += 1
        account_data = decoded[i:i + account_len]
        i += account_len

        j = 0
        secret = None
        name = ""
        issuer = ""

        while j < len(account_data):
            tag = account_data[j]
            j += 1
            if j >= len(account_data):
                break

            value_len = account_data[j]
            j += 1
            value = account_data[j:j + value_len]
            j += value_len

            if tag == 0x0A:
                secret = value
            elif tag == 0x12:
                name = value.decode("utf-8", errors="ignore")
            elif tag == 0x1A:
                issuer = value.decode("utf-8", errors="ignore")

        if secret:
            accounts.append(
                {
                    "secret": base64.b32encode(secret).decode("utf-8"),
                    "name": name,
                    "issuer": issuer,
                }
            )

    return accounts


def get_otp_code() -> str:
    payload = unquote(OTP_EXPORT_DATA.strip())
    if not payload:
        raise RuntimeError("Set OTP_EXPORT_DATA before running.")

    accounts = decode_migration_data(payload)
    if not accounts:
        raise RuntimeError("No OTP accounts were decoded from OTP_EXPORT_DATA.")

    selected = None
    match_key = (OTP_PROFILE_MATCH or "").strip().upper()
    if match_key:
        matched = [
            acc
            for acc in accounts
            if match_key in (acc.get("name", "").upper())
            or match_key in (acc.get("issuer", "").upper())
        ]
        if len(matched) == 1:
            selected = matched[0]
        elif len(matched) > 1:
            labels = [
                f"{idx}: {acc.get('issuer', '')} / {acc.get('name', '')}"
                for idx, acc in enumerate(matched)
            ]
            raise RuntimeError(
                "OTP_PROFILE_MATCH is ambiguous. Matched accounts:\n" + "\n".join(labels)
            )

    if selected is None and OTP_PROFILE_INDEX is not None:
        if OTP_PROFILE_INDEX < 0 or OTP_PROFILE_INDEX >= len(accounts):
            raise RuntimeError(f"OTP_PROFILE_INDEX out of bounds: {OTP_PROFILE_INDEX}")
        selected = accounts[OTP_PROFILE_INDEX]

    if selected is None:
        labels = [
            f"{idx}: {acc.get('issuer', '')} / {acc.get('name', '')}"
            for idx, acc in enumerate(accounts)
        ]
        raise RuntimeError(
            "Could not select OTP profile. Adjust OTP_PROFILE_MATCH or OTP_PROFILE_INDEX.\n"
            + "\n".join(labels)
        )

    return pyotp.TOTP(selected["secret"]).now()


def has_selector(page, selector: str, timeout_ms: int = 800) -> bool:
    try:
        page.wait_for_selector(selector, timeout=timeout_ms, state="attached")
        return True
    except PlaywrightTimeoutError:
        return False


def detect_post_login_step(page, timeout_seconds: float = 20.0) -> str:
    start = time.time()
    while time.time() - start < timeout_seconds:
        current_url = (page.url or "").split("#")[0]

        if has_selector(page, "#txtAcessoCodigo", timeout_ms=500):
            return "otp"

        if (
            current_url == FIRST_CAPTCHA_URL
            or current_url == SECOND_CAPTCHA_URL
            or has_selector(page, "button:has-text('Enviar')", timeout_ms=500)
        ):
            return "captcha"

        if PANEL_URL_CONTAINS in current_url:
            return "panel"

        time.sleep(0.3)

    raise RuntimeError(
        "Timed out waiting for post-login step (captcha, OTP, or painel)."
    )


def wait_until_url_contains(page, expected_fragment: str, timeout_seconds: float = 30.0) -> None:
    start = time.time()
    while time.time() - start < timeout_seconds:
        if expected_fragment in (page.url or ""):
            return
        time.sleep(0.3)
    raise RuntimeError(f"Timed out waiting for URL to contain: {expected_fragment}")


def get_phpsessid_from_cookies(context, timeout_seconds: float = 10.0) -> str | None:
    start = time.time()
    while time.time() - start < timeout_seconds:
        for cookie in context.cookies():
            if cookie.get("name") == "PHPSESSID" and cookie.get("value"):
                return cookie["value"]
        time.sleep(0.3)
    return None


def main() -> None:
    os.environ["XDG_SESSION_TYPE"] = "x11"

    usuario = LOCAL_USUARIO.strip()
    senha = LOCAL_SENHA.strip()
    if not usuario or not senha:
        raise RuntimeError(
            "Set LOCAL_USUARIO and LOCAL_SENHA in playwright-session.py before running."
        )

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        try:
            page.goto(EPROC_URL, wait_until="domcontentloaded")

            page.wait_for_selector("#txtUsuario", timeout=15000)
            page.wait_for_selector("#pwdSenha", timeout=15000)
            page.fill("#txtUsuario", usuario)
            page.fill("#pwdSenha", senha)
            page.click("#sbmEntrar")

            step = detect_post_login_step(page, timeout_seconds=20.0)
            if step == "captcha":
                raise RuntimeError(
                    "Captcha page detected after login. Workflow aborted (captcha solving disabled in Playwright version)."
                )

            if step == "otp":
                page.wait_for_selector("#txtAcessoCodigo", timeout=15000)
                log("OTP page reached (#txtAcessoCodigo found).")
                otp_code = get_otp_code()
                page.fill("#txtAcessoCodigo", otp_code)
                page.click("#btnValidar")
                log("OTP submitted.")
            elif step == "panel":
                log("Painel page reached directly after login.")
            else:
                raise RuntimeError(f"Unexpected post-login step: {step}")

            wait_until_url_contains(page, PANEL_URL_CONTAINS, timeout_seconds=15.0)
            page.wait_for_selector(PANEL_READY_SELECTOR, timeout=15000)
            log("Final painel page reached and loaded.")

            phpsessid = get_phpsessid_from_cookies(context)
            if not phpsessid:
                raise RuntimeError("PHPSESSID not found in cookies after OTP/painel load.")

            result = {
                "phpsessid": phpsessid,
                "page_source_html": page.content(),
            }
            print(json.dumps(result, ensure_ascii=False))
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    # main()
    otp = get_otp_code()
    print(otp)
