from unittest.mock import patch
from scripts.generate_project_repo import create_github_repo, format_repo_name, build_generation_report, push_directory_to_repo


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


def test_push_directory_to_repo_calls_helpers(tmp_path):
    (tmp_path / "README.md").write_text("hello")
    with patch("scripts.generate_project_repo.push_file_to_repo") as mock_push:
        mock_push.return_value = True
        result = push_directory_to_repo(tmp_path, "example-repo", "token")
        assert result is True
        assert mock_push.called
