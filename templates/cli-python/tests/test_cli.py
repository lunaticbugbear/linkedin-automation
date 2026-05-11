from project_package.cli import app
from typer.testing import CliRunner


def test_help_runs():
    runner = CliRunner()
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
