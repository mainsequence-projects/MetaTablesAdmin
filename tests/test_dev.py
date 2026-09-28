"""The Vite child receives proxy material without SDK or workload credentials."""

import json

import pytest

from scripts.dev import sdk_session_environment, vite_environment


@pytest.fixture
def extension_session(monkeypatch, tmp_path):
    from mainsequence.cli import config

    tokens_path = tmp_path / "token.json"
    settings_path = tmp_path / "config.json"
    tokens_path.write_text(json.dumps({"access": "extension-access", "refresh": "extension-refresh"}))
    settings_path.write_text(json.dumps({"backend_url": "http://127.0.0.1:8000/"}))
    monkeypatch.setattr(config, "TOKENS_JSON", tokens_path)
    monkeypatch.setattr(config, "CONFIG_JSON", settings_path)
    monkeypatch.delenv("MAINSEQUENCE_AUTH_MODE", raising=False)
    monkeypatch.delenv("MAIN_SEQUENCE_BACKEND_URL", raising=False)

    def reject_cli_fallback():
        raise AssertionError("Extension mode must not read the CLI credential store")

    monkeypatch.setattr(config, "get_tokens", reject_cli_fallback)
    return tokens_path, settings_path


def test_vscode_session_replaces_stale_inherited_sdk_credentials(extension_session, monkeypatch):
    monkeypatch.setenv("MAINSEQUENCE_ACCESS_TOKEN", "stale-access")
    monkeypatch.setenv("MAINSEQUENCE_REFRESH_TOKEN", "stale-refresh")
    monkeypatch.setenv("MAINSEQUENCE_ENDPOINT", "http://other-backend.invalid")
    session = sdk_session_environment("vscode")
    assert session == {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": "http://127.0.0.1:8000",
        "MAINSEQUENCE_ACCESS_TOKEN": "extension-access",
        "MAINSEQUENCE_REFRESH_TOKEN": "extension-refresh",
    }
    assert not any(name.startswith("MAINSEQUENCE_") for name in vite_environment(session, token="local", port=8001))


@pytest.mark.parametrize("contents", [None, "invalid JSON", "[]", '{"access": ""}', '{"access": "access"}'])
def test_missing_or_invalid_vscode_session_does_not_fall_back_to_cli(extension_session, contents):
    tokens_path, _ = extension_session
    if contents is None:
        tokens_path.unlink()
    else:
        tokens_path.write_text(contents)
    with pytest.raises(RuntimeError, match="No VS Code extension session"):
        sdk_session_environment("vscode")


def test_vscode_session_uses_extensions_backend_override(extension_session, monkeypatch):
    monkeypatch.setenv("MAIN_SEQUENCE_BACKEND_URL", "http://127.0.0.1:9000/")
    assert sdk_session_environment("vscode")["MAINSEQUENCE_ENDPOINT"] == "http://127.0.0.1:9000"


def test_vscode_rejects_malformed_configuration(extension_session):
    _, settings_path = extension_session
    settings_path.write_text("[]")
    with pytest.raises(RuntimeError, match="Invalid Main Sequence extension configuration"):
        sdk_session_environment("vscode")


@pytest.mark.parametrize("metadata", [{"runtimeCredential": True}, {"auth_mode": "runtime_credential"}])
def test_vscode_rejects_runtime_credentials(extension_session, metadata):
    tokens_path, _ = extension_session
    tokens_path.write_text(json.dumps({"access": "access", "refresh": "refresh", **metadata}))
    with pytest.raises(RuntimeError, match="not runtime credentials"):
        sdk_session_environment("vscode")


def test_api_environment_loads_saved_cli_session_before_sdk_imports(monkeypatch):
    from mainsequence.cli import config

    monkeypatch.delenv("MAINSEQUENCE_AUTH_MODE", raising=False)
    monkeypatch.setattr(config, "get_tokens", lambda: {"access": "saved-access", "refresh": "saved-refresh"})
    monkeypatch.setattr(config, "backend_url", lambda: "http://127.0.0.1:8000")
    session = sdk_session_environment()
    assert session == {
        "MAINSEQUENCE_AUTH_MODE": "jwt",
        "MAINSEQUENCE_ENDPOINT": "http://127.0.0.1:8000",
        "MAINSEQUENCE_ACCESS_TOKEN": "saved-access",
        "MAINSEQUENCE_REFRESH_TOKEN": "saved-refresh",
    }
    assert not any(name.startswith("MAINSEQUENCE_") for name in vite_environment(session, token="local", port=8001))


def test_missing_sdk_login_fails_before_launching_services(monkeypatch):
    from mainsequence.cli import config

    monkeypatch.delenv("MAINSEQUENCE_AUTH_MODE", raising=False)
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
        port=8001,
    )
    assert result == {
        "PATH": "/usr/bin",
        "HOME": "/tmp/developer",
        "METATABLES_LOCAL_TOKEN": "test-token",
        "METATABLES_API_TARGET": "http://127.0.0.1:8001",
    }
