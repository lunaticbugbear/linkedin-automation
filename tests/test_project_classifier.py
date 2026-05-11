from scripts.project_classifier import classify_project_type


def test_classify_web_project():
    idea = {
        "title": "Ops Dashboard",
        "description": "A dashboard for tracking incident status",
        "function": "visualize health metrics",
    }
    assert classify_project_type(idea) == "web-app-nextjs"


def test_classify_default_cli_project():
    idea = {
        "title": "Server Health Snapshot",
        "description": "Collects system health details",
        "function": "prints a terminal report",
    }
    assert classify_project_type(idea) == "cli-python"
