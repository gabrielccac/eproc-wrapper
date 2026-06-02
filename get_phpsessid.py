from seleniumbase import Driver
import time
import json
import base64
from urllib.parse import unquote
import os
import sys
import pyotp
from selenium.common.exceptions import UnexpectedAlertPresentException


JFRS_URL = "https://eproc.jfrs.jus.br/eprocV2/externo_controlador.php"
FIRST_CAPTCHA_URL = "https://eproc.jfrs.jus.br/eprocV2/externo_controlador.php?acao=principal&acao_retorno=login"
SECOND_CAPTCHA_URL = "https://eproc.jfrs.jus.br/eprocV2/index.php"
PANEL_URL_CONTAINS = "acao=painel_adv_listar"
PANEL_READY_SELECTOR = 'a[aria-describedby="processoscomprazoemaberto"]'
CAPTCHA_WAIT_SECONDS = 8.0
CAPTCHA_RETRY_ATTEMPTS = 5
CAPTCHA_RETRY_WAIT_SECONDS = 1.5


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


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


def wait_until_url_contains(driver, expected_fragment: str, timeout_seconds: float = 30.0) -> None:
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

        if has_element(driver, "#txtAcessoCodigo", timeout_seconds=0.5):
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
            accounts.append({
                "secret": base64.b32encode(secret).decode("utf-8"),
                "name": name,
                "issuer": issuer,
            })

    return accounts


def get_otp_code() -> str:
    otp_export_data = get_required_env("OTP_EXPORT_DATA")
    otp_profile_match = (os.getenv("OTP_PROFILE_MATCH") or "").strip()
    otp_profile_index_raw = (os.getenv("OTP_PROFILE_INDEX") or "").strip()
    otp_profile_index = int(otp_profile_index_raw) if otp_profile_index_raw else None

    payload = unquote(otp_export_data)
    accounts = decode_migration_data(payload)
    if not accounts:
        raise RuntimeError("No OTP accounts were decoded from OTP_EXPORT_DATA.")

    selected = None
    match_key = otp_profile_match.upper()
    if match_key:
        matched = [
            acc for acc in accounts
            if match_key in (acc.get("name", "").upper()) or match_key in (acc.get("issuer", "").upper())
        ]
        if len(matched) == 1:
            selected = matched[0]
        elif len(matched) > 1:
            labels = [f"{idx}: {acc.get('issuer','')} / {acc.get('name','')}" for idx, acc in enumerate(matched)]
            raise RuntimeError(
                "OTP_PROFILE_MATCH is ambiguous. Matched accounts:\n" + "\n".join(labels)
            )

    if selected is None and otp_profile_index is not None:
        if otp_profile_index < 0 or otp_profile_index >= len(accounts):
            raise RuntimeError(f"OTP_PROFILE_INDEX out of bounds: {otp_profile_index}")
        selected = accounts[otp_profile_index]

    if selected is None:
        labels = [f"{idx}: {acc.get('issuer','')} / {acc.get('name','')}" for idx, acc in enumerate(accounts)]
        raise RuntimeError(
            "Could not select OTP profile. Adjust OTP_PROFILE_MATCH or OTP_PROFILE_INDEX.\n"
            + "\n".join(labels)
        )

    return pyotp.TOTP(selected["secret"]).now()


def main() -> None:
    os.environ["XDG_SESSION_TYPE"] = "x11"
    
    usuario = get_required_env("JFRS_USUARIO")
    senha = get_required_env("JFRS_SENHA")

    driver = Driver(
        uc=True,
        headless=True,
    )

    try:
        driver.get(JFRS_URL)

        usuario_input = driver.wait_for_element("#txtUsuario", timeout=15)
        senha_input = driver.wait_for_element("#pwdSenha", timeout=15)

        if usuario_input is None or senha_input is None:
            raise RuntimeError("Could not locate login input fields.")
        usuario_input.send_keys(usuario)

        senha_input.send_keys(senha)
        driver.click("#sbmEntrar")
        step = detect_post_login_step(driver, timeout_seconds=20.0)

        captcha_count = 0
        while step == "captcha":
            captcha_count += 1
            log(f"Captcha page detected (step {captcha_count}). Waiting for auto-solver...")
            time.sleep(CAPTCHA_WAIT_SECONDS)
            click_captcha_submit(driver)
            step = detect_post_login_step(driver, timeout_seconds=20.0)

        if step == "otp":
            otp_input = driver.wait_for_element("#txtAcessoCodigo", timeout=15)
            log("OTP page reached (#txtAcessoCodigo found).")
            if otp_input is None:
                raise RuntimeError("Could not locate OTP input field.")

            otp_code = get_otp_code()
            otp_input.send_keys(otp_code)
            driver.click("#btnValidar")
            log("OTP submitted.")
        elif step == "panel":
            log("Painel page reached directly after login/captcha.")
        else:
            raise RuntimeError(f"Unexpected post-login step: {step}")

        wait_until_url_contains(driver, PANEL_URL_CONTAINS, timeout_seconds=15.0)
        driver.wait_for_element(PANEL_READY_SELECTOR, timeout=15)
        log("Final painel page reached and loaded.")

        phpsessid = get_phpsessid_from_cookies(driver)
        if not phpsessid:
            raise RuntimeError("PHPSESSID not found in cookies after OTP/painel load.")

        result = {
            "phpsessid": phpsessid,
            "page_source_html": driver.page_source,
        }
        print(json.dumps(result, ensure_ascii=False))
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
