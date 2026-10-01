"""The Vite child receives proxy material without SDK or workload credentials."""

import pytest

from scripts.dev import main
from metatables.cli.local import api_environment, sdk_session_environment, vite_environment


@pytest.fixture
def extension_session(monkeypatch, tmp_path):
    from mainsequence.cli import config

    (tmp_path / ".env").write_text(
        "MAINSEQUENCE_ACCESS_TOKEN=stale-access\n"
        "MAINSEQUENCE_ENDPOINT=http://stale-backend.invalid\n"
        "UNRELATED_SECRET=other-secret\n"
        "# BEGIN MAINSEQUENCE AUTH (managed by VS Code)\n"
        "MAINSEQUENCE_ACCESS_TOKEN=extension-access\n"
        "MAINSEQUENCE_REFRESH_TOKEN=extension-refresh\n"
        "MAINSEQUENCE_ENDPOINT=http://127.0.0.1:8000/\n"
        "# END MAINSEQUENCE AUTH\n"
    )
    monkeypatch.delenv("MAINSEQUENCE_AUTH_MODE", raising=False)
    monkeypatch.delenv("MAIN_SEQUENCE_BACKEND_URL", raising=False)

    def reject_token_copy():
        raise AssertionError("Extension mode must not copy tokens out of the CLI credential reader")

    # A machine without a saved session: the extension's `.env` export is the session.
    monkeypatch.setattr(config, "stored_session_available", lambda backend=None: False)
    monkeypatch.setattr(config, "backend_url", lambda: "http://127.0.0.1:8000")
    monkeypatch.setattr(config, "get_tokens", reject_token_copy)
    monkeypatch.setattr(config, "read_json", lambda *args: pytest.fail("Legacy JSON sessions must not be read"))
    return tmp_path


def with_saved_session(monkeypatch, backend="http://127.0.0.1:8000"):
    from mainsequence.cli import config

    monkeypatch.setattr(config, "stored_session_available", lambda selected=None: selected == backend)


def test_vscode_session_replaces_stale_inherited_sdk_credentials(extension_session, monkeypatch):
    monkeypatch.setenv("MAINSEQUENCE_ACCESS_TOKEN", "stale-access")
    monkeypatch.setenv("MAINSEQUENCE_REFRESH_TOKEN", "stale-refresh")
    monkeypatch.setenv("MAINSEQUENCE_ENDPOINT", "http://other-backend.invalid")
    session = sdk_session_environment("vscode", project_dir=extension_session)
    assert session == {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": "http://127.0.0.1:8000",
        "MAINSEQUENCE_ACCESS_TOKEN": "extension-access",
        "MAINSEQUENCE_REFRESH_TOKEN": "extension-refresh",
    }
    assert not any(name.startswith("MAINSEQUENCE_") for name in vite_environment(session, token="local", port=18473))


@pytest.mark.parametrize("contents", [
    None,
    "\n",
    "# BEGIN MAINSEQUENCE AUTH (managed by VS Code)\nMAINSEQUENCE_ENDPOINT=http://127.0.0.1:8000\n# END MAINSEQUENCE AUTH\n",
    "# BEGIN MAINSEQUENCE AUTH (managed by VS Code)\nMAINSEQUENCE_ACCESS_TOKEN=access\n# END MAINSEQUENCE AUTH\n",
    "# BEGIN MAINSEQUENCE AUTH (managed by VS Code)\n# BEGIN MAINSEQUENCE AUTH (managed by VS Code)\n# END MAINSEQUENCE AUTH\n",
    "# END MAINSEQUENCE AUTH\n# BEGIN MAINSEQUENCE AUTH (managed by VS Code)\n",
])
def test_without_saved_session_a_missing_or_invalid_export_fails(extension_session, contents):
    env_path = extension_session / ".env"
    if contents is None:
        env_path.unlink()
    else:
        env_path.write_text(contents)
    with pytest.raises(RuntimeError, match="No saved SDK session for http://127.0.0.1:8000|Malformed Main Sequence auth block") as failure:
        sdk_session_environment("vscode", project_dir=extension_session)
    assert str(env_path) in str(failure.value)


@pytest.mark.parametrize("contents", [
    None,
    "\n",
    "# BEGIN MAINSEQUENCE AUTH (managed by VS Code)\nMAINSEQUENCE_ENDPOINT=http://127.0.0.1:8000/\n# END MAINSEQUENCE AUTH\n",
])
def test_vscode_uses_the_saved_session_when_the_extension_exports_no_tokens(extension_session, monkeypatch, contents):
    env_path = extension_session / ".env"
    if contents is None:
        env_path.unlink()
    else:
        env_path.write_text(contents)
    with_saved_session(monkeypatch)
    assert sdk_session_environment("vscode", project_dir=extension_session) == {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": "http://127.0.0.1:8000",
    }


def test_saved_session_wins_over_tokens_left_in_the_export(extension_session, monkeypatch):
    monkeypatch.setenv("MAINSEQUENCE_ACCESS_TOKEN", "stale-access")
    with_saved_session(monkeypatch)
    assert sdk_session_environment("vscode", project_dir=extension_session) == {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": "http://127.0.0.1:8000",
    }


def test_vscode_export_without_endpoint_uses_the_configured_backend(extension_session):
    (extension_session / ".env").write_text("MAINSEQUENCE_ACCESS_TOKEN=legacy-access\nMAINSEQUENCE_REFRESH_TOKEN=legacy-refresh\n")
    assert sdk_session_environment("vscode", project_dir=extension_session) == {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": "http://127.0.0.1:8000",
        "MAINSEQUENCE_ACCESS_TOKEN": "legacy-access",
        "MAINSEQUENCE_REFRESH_TOKEN": "legacy-refresh",
    }


@pytest.mark.parametrize("contents", [
    "MAINSEQUENCE_ACCESS_TOKEN=extension-access\nMAINSEQUENCE_REFRESH_TOKEN=extension-refresh\nMAINSEQUENCE_ENDPOINT=http://127.0.0.1:8000/\n",
    "export MAINSEQUENCE_ACCESS_TOKEN='extension-access'\nMAINSEQUENCE_REFRESH_TOKEN = \"extension-refresh\" # comment\nMAINSEQUENCE_ENDPOINT=http://127.0.0.1:8000/\n",
])
def test_vscode_accepts_unmarked_extension_exports(extension_session, contents):
    (extension_session / ".env").write_text(contents + "UNRELATED_SECRET=ignored\n")
    assert sdk_session_environment("vscode", project_dir=extension_session) == {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": "http://127.0.0.1:8000",
        "MAINSEQUENCE_ACCESS_TOKEN": "extension-access",
        "MAINSEQUENCE_REFRESH_TOKEN": "extension-refresh",
    }


def test_missing_value_error_names_fields_without_credentials(extension_session):
    (extension_session / ".env").write_text("MAINSEQUENCE_ACCESS_TOKEN=private-access\nMAINSEQUENCE_ENDPOINT=http://127.0.0.1:8000\n")
    with pytest.raises(RuntimeError) as failure:
        sdk_session_environment("vscode", project_dir=extension_session)
    message = str(failure.value)
    assert "MAINSEQUENCE_REFRESH_TOKEN" in message
    assert "private-access" not in message


def test_auth_failure_returns_status_with_ports_and_no_exception_chain(extension_session, monkeypatch, capsys):
    (extension_session / "api/app").mkdir(parents=True)
    (extension_session / "api/app/main.py").touch()
    (extension_session / "configuration.yaml").write_text("local_mode_available: true\n")
    (extension_session / ".env").unlink()
    monkeypatch.setattr("sys.argv", ["dev.py", "--backend-dir", str(extension_session), "--sdk-session-source", "vscode"])
    assert main() == 1
    output = capsys.readouterr()
    assert "MetaTables API: http://127.0.0.1:18473 (port 18473)" in output.out
    assert "Vite admin:    http://127.0.0.1:19473 (port 19473)" in output.out
    assert "MetaTables launch failed: No saved SDK session for http://127.0.0.1:8000" in output.err
    assert "Traceback" not in output.err


def test_vscode_projection_owns_endpoint_despite_inherited_override(extension_session, monkeypatch):
    monkeypatch.setenv("MAIN_SEQUENCE_BACKEND_URL", "http://127.0.0.1:9000/")
    session = sdk_session_environment("vscode", project_dir=extension_session)
    assert session["MAINSEQUENCE_ENDPOINT"] == "http://127.0.0.1:8000"


def test_vscode_requires_the_backend_checkout():
    with pytest.raises(RuntimeError, match="backend checkout directory"):
        sdk_session_environment("vscode")


def test_vscode_projection_does_not_import_other_settings(extension_session):
    env_path = extension_session / ".env"
    content = env_path.read_text().replace("# END MAINSEQUENCE AUTH", "METATABLES_CATALOG_DATABASE_URL=unrelated\n# END MAINSEQUENCE AUTH")
    env_path.write_text(content)
    session = sdk_session_environment("vscode", project_dir=extension_session)
    assert set(session) == {
        "MAINSEQUENCE_AUTH_MODE", "MAINSEQUENCE_ENDPOINT", "MAINSEQUENCE_ACCESS_TOKEN", "MAINSEQUENCE_REFRESH_TOKEN",
    }


def test_cli_source_names_the_saved_session_backend_and_copies_no_token(monkeypatch):
    from mainsequence.cli import config

    monkeypatch.delenv("MAINSEQUENCE_AUTH_MODE", raising=False)
    monkeypatch.setattr(config, "get_tokens", lambda: pytest.fail("The API process reads the saved session itself"))
    monkeypatch.setattr(config, "backend_url", lambda: "http://127.0.0.1:8000")
    with_saved_session(monkeypatch)
    session = sdk_session_environment()
    assert session == {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": "http://127.0.0.1:8000",
    }
    assert not any(name.startswith("MAINSEQUENCE_") for name in vite_environment(session, token="local", port=18473))


def test_cli_source_without_saved_session_uses_credentials_set_in_the_environment(monkeypatch):
    from mainsequence.cli import config

    monkeypatch.delenv("MAINSEQUENCE_AUTH_MODE", raising=False)
    monkeypatch.setattr(config, "backend_url", lambda: "http://127.0.0.1:8000")
    monkeypatch.setattr(config, "stored_session_available", lambda backend=None: False)
    monkeypatch.setattr(config, "get_tokens", lambda: {"access": "exported-access", "refresh": "exported-refresh"})
    assert sdk_session_environment() == {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": "http://127.0.0.1:8000",
        "MAINSEQUENCE_ACCESS_TOKEN": "exported-access",
        "MAINSEQUENCE_REFRESH_TOKEN": "exported-refresh",
    }


def test_missing_sdk_login_fails_before_launching_services(monkeypatch):
    from mainsequence.cli import config

    monkeypatch.delenv("MAINSEQUENCE_AUTH_MODE", raising=False)
    monkeypatch.setattr(config, "backend_url", lambda: "http://127.0.0.1:8000")
    monkeypatch.setattr(config, "stored_session_available", lambda backend=None: False)
    monkeypatch.setattr(config, "get_tokens", lambda: {})
    with pytest.raises(RuntimeError, match="mainsequence login"):
        sdk_session_environment()


def test_local_debug_does_not_use_workload_credentials(monkeypatch):
    monkeypatch.setenv("MAINSEQUENCE_AUTH_MODE", "runtime_credential")
    with pytest.raises(RuntimeError, match="not runtime credentials"):
        sdk_session_environment()


def test_vite_environment_excludes_sdk_credentials():
    result = vite_environment(
        {
            "PATH": "/usr/bin",
            "HOME": "/tmp/developer",
            "MAINSEQUENCE_ACCESS_TOKEN": "sdk-secret",
            "MAINSEQUENCE_RUNTIME_CREDENTIAL_SECRET": "workload-secret",
            "LOCAL_DATA_SOURCES_FILE": "/tmp/connection-secrets.json",
            "METATABLES_LOCAL_GIT_SOURCE": '{"repository_branch":"stale"}',
        },
        token="test-token",
        port=18473,
    )
    assert result == {
        "PATH": "/usr/bin",
        "HOME": "/tmp/developer",
        "METATABLES_LOCAL_TOKEN": "test-token",
        "METATABLES_API_TARGET": "http://127.0.0.1:18473",
    }


def test_local_environment_supplies_socket_and_browser_guard():
    result = api_environment(
        {"METATABLES_LOCAL_RUNTIME": "false", "MAINSEQUENCE_ACCESS_TOKEN": "developer-session",
         "METATABLES_LOCAL_STORAGE_DIR": "/tmp/custom-workspaces"},
        runtime="local", token="fresh-token", port=18473, admin_port=19473, listener_fd=9,
    )
    assert "METATABLES_LOCAL_RUNTIME" not in result
    assert "METATABLES_LOCAL_LISTENER_FD" not in result
    assert result["MAINSEQUENCE_ACCESS_TOKEN"] == "developer-session"
    assert result["METATABLES_LOCAL_STORAGE_DIR"] == "/tmp/custom-workspaces"


def test_hosted_environment_preserves_deployment_settings_and_clears_local_guard():
    deployment = {
        "MAINSEQUENCE_AUTH_MODE": "runtime_credential",
        "MAINSEQUENCE_RUNTIME_CREDENTIAL_SECRET": "workload-secret",
    }
    result = api_environment(
        {**deployment, "METATABLES_LOCAL_RUNTIME": "true", "METATABLES_LOCAL_TOKEN": "stale-token",
         "METATABLES_LOCAL_LISTENER_FD": "8", "METATABLES_LOCAL_ALLOWED_ORIGINS": "http://127.0.0.1:19473"},
        runtime="hosted", token="", port=18474, admin_port=19474, listener_fd=9,
    )
    assert result == deployment
    vite = vite_environment(result, token="", port=18474)
    assert vite == {"METATABLES_LOCAL_TOKEN": "", "METATABLES_API_TARGET": "http://127.0.0.1:18474"}


@pytest.mark.parametrize("has_configuration", [True, False])
def test_hosted_launch_starts_both_services_without_developer_login(monkeypatch, tmp_path, capsys, has_configuration):
    import json
    from pathlib import Path
    from metatables.cli import local as dev

    (tmp_path / "api/app").mkdir(parents=True)
    (tmp_path / "api/app/main.py").touch()
    if has_configuration:
        (tmp_path / "configuration.yaml").write_text("local_mode_available: false\n")
    monkeypatch.setattr("sys.argv", ["dev.py", "--backend-dir", str(tmp_path),
                                   "--api-port", "18474", "--admin-port", "19474"])
    monkeypatch.setenv("METATABLES_LOCAL_RUNTIME", "true")
    monkeypatch.setenv("METATABLES_LOCAL_TOKEN", "inherited-token")
    monkeypatch.setenv("MAINSEQUENCE_AUTH_MODE", "runtime_credential")
    monkeypatch.setattr(dev, "sdk_session_environment", lambda *args, **kwargs: pytest.fail("Hosted launches must not load developer sessions"))

    class Listener:
        def setsockopt(self, *args): pass
        def bind(self, address): assert address == ("127.0.0.1", 18474)
        def listen(self, backlog): pass
        def fileno(self): return 9
        def close(self): pass

    class Process:
        def poll(self): return 0
        def wait(self, **kwargs): return 0

    launches = []
    def launch(command, **kwargs):
        launches.append((command, kwargs))
        return Process()

    monkeypatch.setattr(dev.socket, "socket", lambda *args: Listener())
    monkeypatch.setattr(dev.subprocess, "Popen", launch)
    assert main() == 0
    assert len(launches) == 2
    api_command, api_options = launches[0]
    assert "api.app.development" in api_command and "--hosted-listener-fd" in api_command
    assert ("--configuration" in api_command) == has_configuration
    assert api_options["pass_fds"] == (9,)
    assert "METATABLES_LOCAL_RUNTIME" not in api_options["env"]
    assert "METATABLES_LOCAL_TOKEN" not in api_options["env"]
    assert api_options["env"]["MAINSEQUENCE_AUTH_MODE"] == "runtime_credential"
    vite_command, vite_options = launches[1]
    assert vite_command[-3:] == ["--port", "19474", "--strictPort"]
    assert vite_options["env"]["METATABLES_API_TARGET"] == "http://127.0.0.1:18474"
    assert vite_options["env"]["METATABLES_LOCAL_TOKEN"] == ""
    assert "MAINSEQUENCE_AUTH_MODE" not in vite_options["env"]
    assert "API runtime:   hosted" in capsys.readouterr().out


@pytest.mark.parametrize("startup_failure", [False, True])
def test_local_launch_publishes_private_example_connection_and_always_cleans_it(extension_session, monkeypatch, capsys, startup_failure):
    import json
    from metatables.cli import local as dev

    project = extension_session
    (project / "api/app").mkdir(parents=True)
    (project / "api/app/main.py").touch()
    (project / "configuration.yaml").write_text("local_mode_available: true\n")
    connection = project / ".local/development-client.json"
    monkeypatch.setattr("sys.argv", ["dev.py", "--backend-dir", str(project), "--sdk-session-source", "vscode"])

    class Listener:
        def setsockopt(self, *args): pass
        def bind(self, address): pass
        def listen(self, backlog): pass
        def fileno(self): return 9
        def close(self): pass

    class Process:
        def poll(self): return 0
        def wait(self, **kwargs): return 0

    tokens = []
    class Supervisor:
        def __init__(self, **kwargs):
            values = json.loads(connection.read_text())
            assert connection.stat().st_mode & 0o777 == 0o600
            assert values["api_url"] == "http://127.0.0.1:18473"
            assert values["token"] == kwargs["token"]
            tokens.append(values["token"])
            if startup_failure:
                raise RuntimeError("Synthetic startup failure")
        def close(self): pass

    monkeypatch.setattr(dev.socket, "socket", lambda *args: Listener())
    monkeypatch.setattr(dev.subprocess, "Popen", lambda *args, **kwargs: Process())
    monkeypatch.setattr("api.app.development.DevelopmentSupervisor", Supervisor)
    assert main() == int(startup_failure)
    assert not connection.exists()
    output = capsys.readouterr()
    assert tokens[0] not in output.out + output.err


@pytest.mark.parametrize("source", ["vscode", "cli"])
def test_local_launch_gives_the_api_the_backend_and_no_inherited_tokens(extension_session, monkeypatch, capsys, source):
    from metatables.cli import local as dev

    project = extension_session
    (project / "api/app").mkdir(parents=True)
    (project / "api/app/main.py").touch()
    (project / "configuration.yaml").write_text("local_mode_available: true\n")
    monkeypatch.setattr("sys.argv", ["dev.py", "--backend-dir", str(project), "--sdk-session-source", source])
    with_saved_session(monkeypatch)
    for name in ("MAINSEQUENCE_ACCESS_TOKEN", "MAINSEQUENCE_REFRESH_TOKEN", "MAIN_SEQUENCE_USER_TOKEN", "MAIN_SEQUENCE_REFRESH_TOKEN"):
        monkeypatch.setenv(name, "expired-copy")

    class Listener:
        def setsockopt(self, *args): pass
        def bind(self, address): pass
        def listen(self, backlog): pass
        def fileno(self): return 9
        def close(self): pass

    class Process:
        def poll(self): return 0
        def wait(self, **kwargs): return 0

    environments = []
    class Supervisor:
        def __init__(self, **kwargs):
            environments.append(kwargs["process_env"])
        def close(self): pass

    monkeypatch.setattr(dev.socket, "socket", lambda *args: Listener())
    monkeypatch.setattr(dev.subprocess, "Popen", lambda *args, **kwargs: Process())
    monkeypatch.setattr("api.app.development.DevelopmentSupervisor", Supervisor)
    assert main() == 0
    [environment] = environments
    assert environment["MAINSEQUENCE_ENDPOINT"] == "http://127.0.0.1:8000"
    assert environment["MAINSEQUENCE_AUTH_MODE"] == "jwt"
    assert not {"MAINSEQUENCE_ACCESS_TOKEN", "MAINSEQUENCE_REFRESH_TOKEN", "MAIN_SEQUENCE_USER_TOKEN",
                "MAIN_SEQUENCE_REFRESH_TOKEN"} & set(environment)
    assert "credentials: saved session" in capsys.readouterr().out
