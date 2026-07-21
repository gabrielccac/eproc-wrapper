import os
import sys
import time
from pathlib import Path

from seleniumbase import Driver

TARGET_URL = "https://www.imovelweb.com.br/imoveis-venda-aguas-claras-df-pagina-20.html"
CLOUDFLARE_WAIT_TITLES = {
    "Just a moment...",
    "Um momento...",
    "Attention Required! | Cloudflare",
}
TITLE_POLL_INTERVAL_SECONDS = 1.0
DEFAULT_TIMEOUT_SECONDS = 180.0


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


def get_timeout_seconds() -> float:
    raw_value = (os.getenv("CF_TITLE_TIMEOUT_SECONDS") or "").strip()
    if not raw_value:
        return DEFAULT_TIMEOUT_SECONDS

    timeout_seconds = float(raw_value)
    if timeout_seconds <= 0:
        raise RuntimeError("CF_TITLE_TIMEOUT_SECONDS must be greater than zero.")
    return timeout_seconds


def build_cookie_header(driver) -> str:
    cookie_parts: list[str] = []
    for cookie in driver.get_cookies():
        name = cookie.get("name")
        value = cookie.get("value")
        if name and value:
            cookie_parts.append(f"{name}={value}")
    return "; ".join(cookie_parts)


def wait_until_title_is_not_cloudflare(
    driver,
    timeout_seconds: float,
) -> str:
    start = time.time()
    last_title = ""

    while time.time() - start < timeout_seconds:
        title = (driver.get_title() or "").strip()
        if title != last_title:
            log(f"Current title: {title or '<empty>'}")
            last_title = title

        if title and title not in CLOUDFLARE_WAIT_TITLES:
            return title

        time.sleep(TITLE_POLL_INTERVAL_SECONDS)

    raise RuntimeError(
        "Timed out waiting for Cloudflare title to change. "
        f"Last observed title: {last_title or '<empty>'}"
    )


def main() -> None:
    load_local_env()
    os.environ["XDG_SESSION_TYPE"] = "x11"

    timeout_seconds = get_timeout_seconds()
    driver = Driver(
        browser="chrome",
        uc=True,
        headless=True,
        no_sandbox=True,
        disable_gpu=True,
        chromium_arg="--disable-dev-shm-usage",
    )

    try:
        log(f"Opening target URL: {TARGET_URL}")
        driver.get(TARGET_URL)

        final_title = wait_until_title_is_not_cloudflare(
            driver,
            timeout_seconds=timeout_seconds,
        )
        log("Cloudflare wait page cleared.")

        cookie_header = build_cookie_header(driver)
        if not cookie_header:
            raise RuntimeError(
                f"Title changed to {final_title!r}, but no cookies were available."
            )

        print(cookie_header)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
