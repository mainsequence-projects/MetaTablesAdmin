"""VS Code launch support for the admin site and its loopback MetaTables API."""

from __future__ import annotations

import argparse
import os
import secrets
import shlex
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


def sdk_session_environment(source: str = "cli", *, project_dir: Path | None = None) -> dict[str, str]:
    """Load the explicitly selected developer session before SDK model imports."""
    if os.environ.get("MAINSEQUENCE_AUTH_MODE", "").strip() == "runtime_credential":
        raise RuntimeError("Local debugging requires a developer SDK login, not runtime credentials.")
    from mainsequence.cli import config

    if source == "vscode":
        if project_dir is None:
            raise RuntimeError("The VS Code session requires the backend checkout directory.")
        # Both extension export formats use these canonical values. Prefer the
        # managed block when present; older exports have no comment markers.
        env_path = project_dir / ".env"
        start = "# BEGIN MAINSEQUENCE AUTH (managed by VS Code)"
        end = "# END MAINSEQUENCE AUTH"
        try:
            lines = env_path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError):
            lines = []
        keys = {"MAINSEQUENCE_ENDPOINT", "MAINSEQUENCE_ACCESS_TOKEN", "MAINSEQUENCE_REFRESH_TOKEN"}
        values: dict[str, str] = {}
        if lines.count(start) == 1 and lines.count(end) == 1 and lines.index(start) < lines.index(end):
            lines = lines[lines.index(start) + 1:lines.index(end)]
        elif start in lines or end in lines:
            raise RuntimeError(f"Malformed Main Sequence auth block in {env_path}. Refresh the backend repository's tokens in the extension.")
        for line in lines:
            assignment = line.strip()
            if assignment.startswith("export "):
                assignment = assignment[7:].lstrip()
            name, separator, value = assignment.partition("=")
            name = name.strip()
            if separator and name in keys:
                try:
                    parts = shlex.split(value, comments=True)
                except ValueError:
                    parts = []
                values[name] = parts[0] if len(parts) == 1 else ""
        missing = sorted(name for name in keys if not values.get(name))
        if missing:
            raise RuntimeError(
                f"Missing SDK session values in {env_path}: {', '.join(missing)}. "
                "In the Main Sequence extension, select the backend code repository "
                "and refresh its tokens to export the session into that file."
            )
        tokens = {"access": values["MAINSEQUENCE_ACCESS_TOKEN"], "refresh": values["MAINSEQUENCE_REFRESH_TOKEN"]}
        endpoint = config.normalize_backend_url(values["MAINSEQUENCE_ENDPOINT"])
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


def api_environment(source: Mapping[str, str], *, runtime: str, **_transport) -> dict[str, str]:
    """Mode is an explicit worker argument; environment carries private inputs only."""
    from api.app.development import worker_process_env
    return worker_process_env(source, runtime)


def _stop(signum: int, frame: object) -> None:
    raise KeyboardInterrupt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-port", type=int, default=18473)
    parser.add_argument("--admin-port", type=int, default=19473)
    parser.add_argument("--backend-dir", type=Path, required=True)
    parser.add_argument("--runtime", choices=("local", "hosted"), default=None)
    parser.add_argument("--configuration", type=Path)
    parser.add_argument("--sdk-session-source", choices=("vscode", "cli"), default="cli")
    args = parser.parse_args()
    if not 1 <= args.api_port <= 65535:
        parser.error("--api-port must be between 1 and 65535")
    if not 1 <= args.admin_port <= 65535:
        parser.error("--admin-port must be between 1 and 65535")
    if args.api_port == args.admin_port:
        parser.error("--api-port and --admin-port must be different")
    admin_dir = Path(__file__).resolve().parents[1]
    project_dir = args.backend_dir.resolve()
    if not (project_dir / "api/app/main.py").is_file():
        parser.error("--backend-dir must point to the MetaTables API project")
    vite_entrypoint = admin_dir / "node_modules/vite/bin/vite.js"
    if not vite_entrypoint.is_file():
        parser.error("Run npm ci in metatablesadmin before launching")
    from api.app.configuration import DeploymentConfiguration
    from api.app.development import DevelopmentSupervisor
    configuration = (args.configuration or project_dir / "configuration.yaml").resolve()
    default_missing = args.configuration is None and not configuration.exists()
    try:
        deployment = DeploymentConfiguration() if default_missing else DeploymentConfiguration.load(configuration)
        if args.runtime == "local":
            deployment.require_development()
    except RuntimeError as exc:
        print(f"MetaTables launch failed: {exc}", file=sys.stderr, flush=True)
        return 1
    print(
        "Launch configuration:\n"
        f"  API runtime:   {args.runtime or ('saved selection / local' if deployment.local_mode_available else 'hosted')}\n"
        f"  MetaTables API: http://127.0.0.1:{args.api_port} (port {args.api_port})\n"
        f"  Vite admin:    http://127.0.0.1:{args.admin_port} (port {args.admin_port})",
        flush=True,
    )
    source = os.environ.copy()
    if deployment.local_mode_available:
        try:
            sdk_session = sdk_session_environment(args.sdk_session_source, project_dir=project_dir)
        except RuntimeError as exc:
            print(f"MetaTables launch failed: {exc}", file=sys.stderr, flush=True)
            return 1
        source.update(sdk_session)
        print(f"SDK session source: {args.sdk_session_source}; platform: {sdk_session['MAINSEQUENCE_ENDPOINT']}", flush=True)
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        listener.bind(("127.0.0.1", args.api_port))
        listener.listen(128)
    except OSError as exc:
        listener.close()
        print(f"MetaTables launch failed: API port {args.api_port}: {exc.strerror}. "
              "Choose another --api-port in launch.json.", file=sys.stderr, flush=True)
        return 1
    token = secrets.token_urlsafe(48) if deployment.local_mode_available else ""
    vite_env = vite_environment(os.environ, token=token, port=args.api_port)
    supervisor = None
    client_launch = None
    children: list[subprocess.Popen[bytes]] = []
    failed = False
    previous_handler = signal.signal(signal.SIGTERM, _stop)
    try:
        if deployment.local_mode_available:
            from api.app.development_client import publish_development_client
            client_launch = publish_development_client(project_dir, port=args.api_port, token=token)
            supervisor = DevelopmentSupervisor(project_dir=project_dir, configuration=configuration,
                process_env=source, listener=listener, token=token, admin_port=args.admin_port,
                mode=args.runtime)
        else:
            config_args = [] if default_missing else ["--configuration", str(configuration)]
            children.append(subprocess.Popen(
                [sys.executable, "-m", "api.app.development", "--hosted-listener-fd",
                 str(listener.fileno()), *config_args], cwd=project_dir,
                env=api_environment(source, runtime="hosted"), pass_fds=(listener.fileno(),)))
        children.append(subprocess.Popen(
            ["node", str(vite_entrypoint), "--host", "127.0.0.1", "--port",
             str(args.admin_port), "--strictPort"], cwd=admin_dir, env=vite_env))
        while all(child.poll() is None for child in children):
            if supervisor is not None:
                code = supervisor.poll()
                if code is not None:
                    failed = code != 0
                    break
            time.sleep(0.2)
        failed = failed or any(child.poll() not in (None, 0) for child in children)
    except KeyboardInterrupt:
        pass
    except (RuntimeError, OSError, ValueError) as exc:
        print(f"MetaTables launch failed: {exc}", file=sys.stderr, flush=True)
        failed = True
    finally:
        signal.signal(signal.SIGTERM, previous_handler)
        if supervisor is not None:
            supervisor.close()
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
        if client_launch is not None:
            from api.app.development_client import clear_development_client
            clear_development_client(project_dir, client_launch)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
