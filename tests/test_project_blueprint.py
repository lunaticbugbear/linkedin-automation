from scripts.project_blueprint import build_blueprint


def test_blueprint_cli_contains_validation_commands():
    idea = {
        "title": "Server Health Snapshot",
        "description": "Collects system health details",
        "function": "prints a terminal report",
        "use_case": "Quick triage during incidents",
    }
    blueprint = build_blueprint(idea, "cli-python")

    assert blueprint["project_type"] == "cli-python"
    assert "python -m pytest" in blueprint["validation_commands"]
    assert "GENERATION_REPORT.md" in blueprint["files_to_generate"]
