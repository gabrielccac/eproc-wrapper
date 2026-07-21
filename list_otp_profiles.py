import base64
import os
import sys
from pathlib import Path
from urllib.parse import unquote


DEFAULT_EXPORT_VARS = ("OTP_EXPORT_DATA", "EXPORT_2FA_DATA")


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


def get_selected_accounts(
    accounts: list[dict], match_value: str, index_value: str
) -> tuple[list[int], list[str]]:
    selected_indexes: list[int] = []
    warnings: list[str] = []

    match_key = match_value.strip().upper()
    if match_key:
        for idx, account in enumerate(accounts):
            name = account.get("name", "").upper()
            issuer = account.get("issuer", "").upper()
            if match_key in name or match_key in issuer:
                selected_indexes.append(idx)

        if len(selected_indexes) > 1:
            warnings.append(
                f"OTP_PROFILE_MATCH={match_value!r} matches multiple profiles."
            )

    index_raw = index_value.strip()
    if index_raw:
        try:
            index = int(index_raw)
        except ValueError:
            warnings.append(f"OTP_PROFILE_INDEX={index_value!r} is not an integer.")
        else:
            if 0 <= index < len(accounts):
                if index not in selected_indexes:
                    selected_indexes.append(index)
            else:
                warnings.append(
                    f"OTP_PROFILE_INDEX={index} is outside 0..{len(accounts) - 1}."
                )

    return selected_indexes, warnings


def print_profiles(export_var: str) -> int:
    export_value = (os.getenv(export_var) or "").strip()
    if not export_value:
        print(f"{export_var}: not set")
        return 1

    accounts = decode_migration_data(unquote(export_value))
    if not accounts:
        print(f"{export_var}: no OTP profiles decoded")
        return 1

    match_value = (os.getenv("OTP_PROFILE_MATCH") or "").strip()
    index_value = (os.getenv("OTP_PROFILE_INDEX") or "").strip()
    selected_indexes, warnings = get_selected_accounts(
        accounts, match_value, index_value
    )
    selected_set = set(selected_indexes)

    print(f"{export_var}: {len(accounts)} profile(s)")
    print(f"OTP_PROFILE_MATCH={match_value!r}")
    print(f"OTP_PROFILE_INDEX={index_value!r}")

    for warning in warnings:
        print(f"warning: {warning}")

    for idx, account in enumerate(accounts):
        markers: list[str] = []
        if match_value and match_value.upper() in account.get("name", "").upper():
            markers.append("match:name")
        if match_value and match_value.upper() in account.get("issuer", "").upper():
            markers.append("match:issuer")
        if index_value:
            try:
                if idx == int(index_value):
                    markers.append("index")
            except ValueError:
                pass
        if idx in selected_set:
            markers.append("selected")

        marker_text = f" [{', '.join(markers)}]" if markers else ""
        print(
            f"{idx}: issuer={account.get('issuer', '')!r} "
            f"name={account.get('name', '')!r}{marker_text}"
        )

    return 0


def main() -> None:
    load_local_env()

    export_vars = tuple(sys.argv[1:]) or DEFAULT_EXPORT_VARS
    exit_code = 0

    for idx, export_var in enumerate(export_vars):
        if idx:
            print()
        exit_code = max(exit_code, print_profiles(export_var))

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
