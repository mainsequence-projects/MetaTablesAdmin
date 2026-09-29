"""Run both workspace launch configurations through VS Code's debugpy adapter.

Uses an empty temporary backend to check pre-start output without reading any
developer credential file or starting either service.
"""

import json
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import threading
import time


def resolve(value, workspace, settings):
    if isinstance(value, str):
        value = value.replace("${workspaceFolder}", str(workspace))
        for name, setting in settings.items():
            value = value.replace("${config:" + name + "}", str(setting))
        return value
    if isinstance(value, list):
        return [resolve(item, workspace, settings) for item in value]
    if isinstance(value, dict):
        return {name: resolve(item, workspace, settings) for name, item in value.items()}
    return value


def check(workspace, adapter_libs):
    settings = json.loads((workspace / ".vscode/settings.json").read_text())
    config = resolve(json.loads((workspace / ".vscode/launch.json").read_text())["configurations"][0], workspace, settings)
    assert Path(config["program"]).is_file()
    assert Path(config["python"]).is_file()
    assert Path(config["cwd"]).is_dir()
    assert Path(config["envFile"]).is_file()
    with tempfile.TemporaryDirectory(prefix="metatables-dap-") as temporary:
        backend = Path(temporary)
        (backend / "api/app").mkdir(parents=True)
        (backend / "api/app/main.py").write_text("# Empty validation fixture\n")
        (backend / "configuration.yaml").write_text("local_mode_available: true\n")
        arguments = config["args"].copy()
        arguments[arguments.index("--backend-dir") + 1] = str(backend)
        environment = {"PATH": os.environ["PATH"], "HOME": str(backend), "PYTHONPATH": str(adapter_libs)}
        config.update(args=arguments, cwd=str(backend), env=environment)
        adapter = subprocess.Popen([config["python"], "-m", "debugpy.adapter"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=environment)
        messages = queue.Queue()

        def receive():
            try:
                while True:
                    headers = {}
                    while True:
                        line = adapter.stdout.readline()
                        if not line:
                            return
                        if line == b"\r\n":
                            break
                        name, value = line.decode().split(":", 1)
                        headers[name.lower()] = value.strip()
                    body = adapter.stdout.read(int(headers["content-length"]))
                    messages.put(json.loads(body))
            except Exception as error:
                messages.put(error)

        threading.Thread(target=receive, daemon=True).start()
        sequence = 0

        def send(message):
            nonlocal sequence
            sequence += 1
            message["seq"] = sequence
            body = json.dumps(message).encode()
            adapter.stdin.write(f"Content-Length: {len(body)}\r\n\r\n".encode() + body)
            adapter.stdin.flush()

        terminals = []
        outputs = []
        deadline = time.monotonic() + 20
        send({"type": "request", "command": "initialize", "arguments": {
            "clientID": "vscode", "adapterID": "python", "pathFormat": "path",
            "linesStartAt1": True, "columnsStartAt1": True, "supportsRunInTerminalRequest": True,
        }})
        try:
            while time.monotonic() < deadline:
                message = messages.get(timeout=max(0.1, deadline - time.monotonic()))
                if isinstance(message, Exception):
                    raise message
                if message.get("type") == "response":
                    assert message.get("success", False), message.get("message", "DAP request failed")
                    if message.get("command") == "initialize":
                        send({"type": "request", "command": "launch", "arguments": config})
                elif message.get("type") == "request" and message.get("command") == "runInTerminal":
                    request = message["arguments"]
                    terminal_env = environment.copy()
                    for key, value in request.get("env", {}).items():
                        if value is None:
                            terminal_env.pop(key, None)
                        else:
                            terminal_env[key] = value
                    terminal = subprocess.Popen(request["args"], cwd=request["cwd"], env=terminal_env,
                                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    terminals.append(terminal)
                    send({"type": "response", "request_seq": message["seq"], "command": "runInTerminal",
                          "success": True, "body": {"processId": terminal.pid}})
                elif message.get("event") == "initialized":
                    send({"type": "request", "command": "configurationDone", "arguments": {}})
                elif message.get("event") == "output":
                    outputs.append(message["body"].get("output", ""))
                elif message.get("event") == "terminated":
                    break
            else:
                raise AssertionError("Debug session did not finish within 20 seconds")
            output = "".join(outputs)
            assert "MetaTables API: http://127.0.0.1:18473 (port 18473)" in output, "API port missing from DAP output"
            assert "Vite admin:    http://127.0.0.1:19473 (port 19473)" in output, "Vite port missing from DAP output"
            assert "MetaTables launch failed: Missing SDK session values" in output, "Expected isolated fixture credential error missing"
            assert "Traceback" not in output, "Credential failure should not produce an exception chain"
            print(f"{workspace.name}: both ports and credential error received as Debug Console events")
        finally:
            adapter.terminate()
            try:
                adapter.wait(timeout=3)
            except subprocess.TimeoutExpired:
                adapter.kill()
                adapter.wait()
            for terminal in terminals:
                if terminal.poll() is None:
                    terminal.terminate()
                try:
                    terminal.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    terminal.kill()
                    terminal.wait()


if __name__ == "__main__":
    admin = Path(__file__).resolve().parents[1]
    settings = json.loads((admin / ".vscode/settings.json").read_text())
    backend = (admin / settings["metatables.backendPath"]).resolve()
    candidates = sorted((Path.home() / ".vscode/extensions").glob("ms-python.debugpy-*/bundled/libs"))
    assert candidates, "VS Code Python Debugger extension is not installed"
    for workspace in (backend, admin):
        check(workspace, candidates[-1])
