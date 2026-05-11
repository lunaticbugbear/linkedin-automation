from unittest.mock import patch, MagicMock
from scripts.generate_project_repo import create_github_repo, format_repo_name, build_generation_report


def test_format_repo_name():
    name = format_repo_name("My Cool Project", "2026-05-10")
    assert name == "project-my-cool-project-20260510"


def test_create_github_repo_calls_api():
    with patch("requests.post") as mock_post:
        mock_post.return_value.status_code = 201
        mock_post.return_value.json.return_value = {"html_url": "https://github.com/user/repo"}

        result = create_github_repo(
            repo_name="test-repo",
            description="Test",
            token="fake-token",
        )

        assert result["html_url"] == "https://github.com/user/repo"
        mock_post.assert_called_once()


def test_build_generation_report():
    report = build_generation_report(
        source_idea={"title": "Server Health Snapshot", "function": "Collect metrics"},
        project_type="cli-python",
        validation_result={"status": "passed"},
        ci_result={"status": "passed"},
        vercel_url=None,
    )
    assert "Server Health Snapshot" in report
    assert "cli-python" in report
