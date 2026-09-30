"""VS Code entry point using the installed MetaTables local launcher."""

from pathlib import Path

from metatables.cli.local import main as launch_main


def main() -> int:
    return launch_main(admin_dir=Path(__file__).resolve().parents[1])


if __name__ == "__main__":
    raise SystemExit(main())
