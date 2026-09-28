"""VS Code launch support for the admin site and its loopback MetaTables API."""

from __future__ import annotations

import argparse
import os
import secrets
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Mapping


VITE_PROCESS_ENV = frozenset(
    {"PATH", "HOME", "USER", "SHELL", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "TERM"}
)


def sdk_session_environment(source: str = "cli") -> dict[str, str]:
    """Load the explicitly selected developer session before SDK model imports."""
    if os.environ.get("MAINSEQUENCE_AUTH_MODE", "").strip() == "runtime_credential":
        raise RuntimeError("Local debugging requires a developer SDK login, not runtime credentials.")
    from mainsequence.cli import config

    if source == "vscode":
        # Installed VS Code extension 0.1.43 writes token.json, while the SDK's
        # get_tokens() reads Keychain/auth.json. Never silently mix these stores.
        tokens = config.read_json(config.TOKENS_JSON, {})
        settings = config.read_json(config.CONFIG_JSON, {})
        if not isinstance(settings, dict):
            raise RuntimeError("Invalid Main Sequence extension configuration. Configure its backend URL again.")
        endpoint = config.normalize_backend_url(
            os.environ.get("MAIN_SEQUENCE_BACKEND_URL")
            if "MAIN_SEQUENCE_BACKEND_URL" in os.environ
            else settings.get("backend_url") or config.STANDARD_BACKEND_URL
        )
        if not isinstance(tokens, dict) or not all(
            isinstance(tokens.get(name), str) and tokens[name].strip()
            for name in ("access", "refresh")
        ):
            raise RuntimeError("No VS Code extension session. Sign in or refresh credentials in the Main Sequence extension.")
        if tokens.get("runtime_credential") or tokens.get("runtimeCredential") or any(
            str(tokens.get(name, "")).strip().lower() == "runtime_credential"
            for name in ("auth_mode", "credential_mode", "token_source", "source")
        ):
            raise RuntimeError("Local debugging requires a developer SDK login, not runtime credentials.")
    elif source == "cli":
        tokens = config.get_tokens()
        endpoint = config.backend_url()
        if not tokens.get("access"):
            raise RuntimeError("No saved SDK session. Run 'mainsequence login' with the backend .venv first.")
    else:
        raise RuntimeError("Unknown SDK session source. Select vscode or cli.")
    if not endpoint:
        raise RuntimeError("The selected SDK session has no configured Main Sequence backend.")
    return {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": endpoint,
        "MAINSEQUENCE_ACCESS_TOKEN": str(tokens["access"]),
        "MAINSEQUENCE_REFRESH_TOKEN": str(tokens.get("refresh") or ""),
    }


def vite_environment(source: Mapping[str, str], *, token: str, port: int) -> dict[str, str]:
    values = {name: value for name, value in source.items() if name in VITE_PROCESS_ENV}
    values.update(
        {
            "METATABLES_LOCAL_TOKEN": token,
            "METATABLES_API_TARGET": f"http://127.0.0.1:{port}",
        }
    )
    return values


def _stop(signum: int, frame: object) -> None:
    raise KeyboardInterrupt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-port", type=int, default=8001)
    parser.add_argument("--admin-port", type=int, choices=(5175,), default=5175)
    parser.add_argument("--backend-dir", type=Path, required=True)
    parser.add_argument("--sdk-session-source", choices=("vscode", "cli"), default="cli")
    args = parser.parse_args()
    if not 1 <= args.api_port <= 65535:
        parser.error("--api-port must be between 1 and 65535")
    admin_dir = Path(__file__).resolve().parents[1]
    project_dir = args.backend_dir.resolve()
    if not (project_dir / "api/app/main.py").is_file():
        parser.error("--backend-dir must point to the MetaTables API project")
    vite_entrypoint = admin_dir / "node_modules/vite/bin/vite.js"
    if not vite_entrypoint.is_file():
        parser.error("Run npm ci in metatablesadmin before launching")
    try:
        sdk_session = sdk_session_environment(args.sdk_session_source)
    except RuntimeError as exc:
        parser.error(str(exc))
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(("127.0.0.1", args.api_port))
    listener.listen(128)
    token = secrets.token_urlsafe(48)
    api_environment = os.environ.copy()
    api_environment.update(sdk_session)
    api_environment.update(
        {
            "METATABLES_LOCAL_RUNTIME": "true",
            "METATABLES_LOCAL_BIND_HOST": "127.0.0.1",
            "METATABLES_LOCAL_BIND_PORT": str(args.api_port),
            "METATABLES_LOCAL_LISTENER_FD": str(listener.fileno()),
            "METATABLES_LOCAL_TOKEN": token,
            "METATABLES_API_TARGET": f"http://127.0.0.1:{args.api_port}",
            "METATABLES_LOCAL_ALLOWED_ORIGINS": f"http://127.0.0.1:{args.admin_port}",
        }
    )
    vite_env = vite_environment(os.environ, token=token, port=args.api_port)
    print(f"SDK session source: {args.sdk_session_source}; platform: {sdk_session['MAINSEQUENCE_ENDPOINT']}", flush=True)
    children: list[subprocess.Popen[bytes]] = []
    failed = False
    previous_handler = signal.signal(signal.SIGTERM, _stop)
    try:
        children.append(
            subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "api.app.main:app",
                    "--fd",
                    str(listener.fileno()),
                    "--no-proxy-headers",
                ],
                cwd=project_dir,
                env=api_environment,
                pass_fds=(listener.fileno(),),
            )
        )
        children.append(
            subprocess.Popen(
                [
                    "node",
                    str(vite_entrypoint),
                    "--host",
                    "127.0.0.1",
                    "--port",
                    str(args.admin_port),
                    "--strictPort",
                ],
                cwd=admin_dir,
                env=vite_env,
            )
        )
        print(
            f"MetaTables API: http://127.0.0.1:{args.api_port}; "
            f"admin site: http://127.0.0.1:{args.admin_port}",
            flush=True,
        )
        while all(child.poll() is None for child in children):
            time.sleep(0.2)
        failed = any(child.poll() not in (None, 0) for child in children)
    except KeyboardInterrupt:
        pass
    finally:
        signal.signal(signal.SIGTERM, previous_handler)
        for child in children:
            if child.poll() is None:
                child.terminate()
        for child in children:
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        listener.close()
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
