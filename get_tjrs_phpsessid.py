import base64
import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import unquote

import pyotp
from selenium.common.exceptions import UnexpectedAlertPresentException
from seleniumbase import Driver

EPROC_URL = "https://eproc1g.tjrs.jus.br/"
FIRST_CAPTCHA_URL = "https://eproc1g.tjrs.jus.br/?acao=principal&acao_retorno=login"
SECOND_CAPTCHA_URL = "https://eproc1g.tjrs.jus.br/index.php"
OTP_URL_PREFIX = (
    "https://keycloak-eks.tjrs.jus.br/realms/eproc/login-actions/authenticate"
)
PANEL_URL_CONTAINS = "acao=painel_adv_listar"
PANEL_READY_SELECTOR = 'a[aria-describedby="processoscomprazoemaberto"]'
CAPTCHA_WAIT_SECONDS = 8.0
CAPTCHA_RETRY_ATTEMPTS = 5
CAPTCHA_RETRY_WAIT_SECONDS = 1.5
KEEP_BROWSER_OPEN_AFTER_FLOW = False


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def load_local_env() -> None:
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.is_file():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not key:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        os.environ[key] = value


def get_required_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise RuntimeError(f"Set {name} before running.")
    return value


def get_phpsessid_from_cookies(driver, timeout_seconds: float = 10.0) -> str | None:
    start = time.time()
    while time.time() - start < timeout_seconds:
        for cookie in driver.get_cookies():
            if cookie.get("name") == "PHPSESSID" and cookie.get("value"):
                return cookie["value"]
        time.sleep(0.3)
    return None


def click_captcha_submit(driver, max_attempts: int = CAPTCHA_RETRY_ATTEMPTS) -> None:
    selectors = [
        "button:contains('Enviar')",
    ]

    for attempt in range(1, max_attempts + 1):
        for selector in selectors:
            try:
                driver.wait_for_element(selector, timeout=3)
                driver.click(selector)
                return
            except UnexpectedAlertPresentException:
                try:
                    alert = driver.switch_to.alert
                    alert_text = alert.text or ""
                    alert.accept()
                    log(
                        f"Captcha still verifying (attempt {attempt}/{max_attempts}): {alert_text}"
                    )
                except Exception:
                    pass
                time.sleep(CAPTCHA_RETRY_WAIT_SECONDS)
                break
            except Exception:
                continue

    raise RuntimeError(
        f"Could not click captcha submit after {max_attempts} attempt(s)."
    )


def wait_until_url_is(driver, expected_url: str, timeout_seconds: float = 30.0) -> None:
    start = time.time()
    while time.time() - start < timeout_seconds:
        if driver.get_current_url().split("#")[0] == expected_url:
            return
        time.sleep(0.3)
    raise RuntimeError(f"Timed out waiting for URL: {expected_url}")


def wait_until_url_contains(
    driver, expected_fragment: str, timeout_seconds: float = 30.0
) -> None:
    start = time.time()
    while time.time() - start < timeout_seconds:
        if expected_fragment in (driver.get_current_url() or ""):
            return
        time.sleep(0.3)
    raise RuntimeError(f"Timed out waiting for URL to contain: {expected_fragment}")


def has_element(driver, selector: str, timeout_seconds: float = 0.8) -> bool:
    try:
        return driver.wait_for_element(selector, timeout=timeout_seconds) is not None
    except Exception:
        return False


def detect_post_login_step(driver, timeout_seconds: float = 20.0) -> str:
    start = time.time()
    while time.time() - start < timeout_seconds:
        current_url = (driver.get_current_url() or "").split("#")[0]

        if current_url.startswith(OTP_URL_PREFIX) or has_element(
            driver, "#otp", timeout_seconds=0.5
        ):
            return "otp"

        if (
            current_url == FIRST_CAPTCHA_URL
            or current_url == SECOND_CAPTCHA_URL
            or has_element(driver, "button:contains('Enviar')", timeout_seconds=0.5)
        ):
            return "captcha"

        if PANEL_URL_CONTAINS in current_url:
            return "panel"

        time.sleep(0.3)

    raise RuntimeError(
        "Timed out waiting for post-login step (captcha, OTP, or painel)."
    )


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
        account_data = decoded[i : i + account_len]
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
            value = account_data[j : j + value_len]
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
    otp_export_data = get_required_env("OTP_EXPORT_DATA")
    otp_profile_match = (os.getenv("TJRS_OTP_PROFILE_MATCH") or "").strip()
    otp_profile_index_raw = (os.getenv("TJRS_OTP_PROFILE_INDEX") or "").strip()
    otp_profile_index = int(otp_profile_index_raw) if otp_profile_index_raw else None

    payload = unquote(otp_export_data)

    accounts = decode_migration_data(payload)
    if not accounts:
        raise RuntimeError("No OTP accounts were decoded from OTP_EXPORT_DATA.")

    selected = None
    match_key = otp_profile_match.upper()
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
                "OTP_PROFILE_MATCH is ambiguous. Matched accounts:\n"
                + "\n".join(labels)
            )

    if selected is None and otp_profile_index is not None:
        if otp_profile_index < 0 or otp_profile_index >= len(accounts):
            raise RuntimeError(f"OTP_PROFILE_INDEX out of bounds: {otp_profile_index}")
        selected = accounts[otp_profile_index]

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


def main() -> None:
    load_local_env()
    os.environ["XDG_SESSION_TYPE"] = "x11"

    usuario = get_required_env("TJRS_USUARIO")
    senha = get_required_env("TJRS_SENHA")

    driver = Driver(
        uc=True,
        headless=True,
    )

    try:
        driver.get(EPROC_URL)

        usuario_input = driver.wait_for_element("#username", timeout=15)
        senha_input = driver.wait_for_element("#password", timeout=15)

        if usuario_input is None or senha_input is None:
            raise RuntimeError("Could not locate login input fields.")
        usuario_input.send_keys(usuario)

        senha_input.send_keys(senha)
        driver.click("#kc-login")

        step = detect_post_login_step(driver, timeout_seconds=20.0)

        if step == "otp":
            otp_input = driver.wait_for_element("#otp", timeout=15)
            log("OTP page reached (#otp found).")
            if otp_input is None:
                raise RuntimeError("Could not locate OTP input field.")

            otp_code = get_otp_code()
            otp_input.send_keys(otp_code)

            if has_element(driver, "#kc-login", timeout_seconds=2.0):
                driver.click("#kc-login")
            elif has_element(driver, "input[name='login']", timeout_seconds=2.0):
                driver.click("input[name='login']")
            elif has_element(driver, "button[type='submit']", timeout_seconds=2.0):
                driver.click("button[type='submit']")
            else:
                otp_input.send_keys("\n")

            log("OTP submitted.")
        elif step == "captcha":
            log(
                "Captcha step detected after login; keeping this path for future handling."
            )
        elif step == "panel":
            log("Painel page reached directly after login.")
        else:
            raise RuntimeError(f"Unexpected post-login step: {step}")

        wait_until_url_contains(driver, PANEL_URL_CONTAINS, timeout_seconds=30.0)
        driver.wait_for_element(PANEL_READY_SELECTOR, timeout=20)
        log("Final painel page reached and loaded.")

        time.sleep(1.0)
        phpsessid = get_phpsessid_from_cookies(driver, timeout_seconds=10.0) or ""

        result = {
            "phpsessid": phpsessid,
            "page_source_html": driver.page_source,
            "current_url": driver.get_current_url(),
            "step": step,
        }
        print(json.dumps(result, ensure_ascii=False))
        if KEEP_BROWSER_OPEN_AFTER_FLOW:
            log("Debug mode enabled: browser will stay open. Press Ctrl+C to end.")
            while True:
                time.sleep(1)
    finally:
        if not KEEP_BROWSER_OPEN_AFTER_FLOW:
            driver.quit()


if __name__ == "__main__":
    main()
