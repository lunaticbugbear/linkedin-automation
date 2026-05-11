from unittest.mock import patch, MagicMock
from scripts.main import run_cycle


def _config():
    return {
        "notifications": {
            "telegram": {
                "enabled": True,
                "bot_token": "bot",
                "chat_id": "chat",
                "selection_timeout_seconds": 1800,
            }
        },
        "github": {"token": "gh"},
        "linkedin": {"visual_output_dir": "outputs"},
        "ai": {"max_projects": 3},
    }


def _ideas():
    return [
        {"title": "SLA Radar", "description": "Desc 1", "function": "Func 1", "use_case": "Use 1", "tech_stack": "Python", "repo_name": "sla-radar", "linkedin_post": "Post 1", "key_features": ["A", "B"]},
        {"title": "Linux Pulse", "description": "Desc 2", "function": "Func 2", "use_case": "Use 2", "tech_stack": "Python", "repo_name": "linux-pulse", "linkedin_post": "Post 2", "key_features": ["A", "B"]},
        {"title": "Access Guard", "description": "Desc 3", "function": "Func 3", "use_case": "Use 3", "tech_stack": "Python", "repo_name": "access-guard", "linkedin_post": "Post 3", "key_features": ["A", "B"]},
    ]


@patch("scripts.main.send_final_project")
@patch("scripts.main.generate_project_banner")
@patch("scripts.main.format_linkedin_post")
@patch("scripts.main.create_github_repo")
@patch("scripts.main.format_repo_name")
@patch("scripts.main.answer_callback_query")
@patch("scripts.main.wait_for_project_selection")
@patch("scripts.main.send_project_options")
@patch("scripts.main.generate_project_ideas")
@patch("scripts.main.load_config")
def test_run_cycle_creates_only_selected_project(
    mock_load_config,
    mock_generate_ideas,
    mock_send_options,
    mock_wait_selection,
    mock_answer_callback,
    mock_format_repo_name,
    mock_create_repo,
    mock_format_post,
    mock_generate_banner,
    mock_send_final,
):
    mock_load_config.return_value = _config()
    mock_generate_ideas.return_value = _ideas()
    mock_send_options.return_value = 123
    mock_wait_selection.return_value = {"index": 1, "callback_query_id": "cb1"}
    mock_format_repo_name.return_value = "project-linux-pulse-20260511"
    mock_create_repo.return_value = {"html_url": "https://github.com/example/project-linux-pulse"}
    mock_format_post.return_value = "Formatted Post 2"
    mock_generate_banner.return_value = "outputs/linux-pulse-banner.png"

    result = run_cycle()

    assert result["title"] == "Linux Pulse"
    assert result["repo_url"] == "https://github.com/example/project-linux-pulse"
    mock_create_repo.assert_called_once()
    mock_create_repo.assert_called_once_with(
        repo_name="project-linux-pulse-20260511",
        description="Desc 2",
        token="gh",
    )
    mock_send_final.assert_called_once()
    mock_answer_callback.assert_called_once_with("bot", "cb1", "Project 2 dipilih")


@patch("scripts.main.send_telegram_notification")
@patch("scripts.main.wait_for_project_selection")
@patch("scripts.main.send_project_options")
@patch("scripts.main.generate_project_ideas")
@patch("scripts.main.load_config")
def test_run_cycle_cancels_when_no_selection(mock_load_config, mock_generate_ideas, mock_send_options, mock_wait_selection, mock_notify):
    mock_load_config.return_value = _config()
    mock_generate_ideas.return_value = _ideas()
    mock_send_options.return_value = 123
    mock_wait_selection.return_value = None

    result = run_cycle()

    assert result is None
    mock_notify.assert_called_once_with("No selection received. Cycle cancelled.", "bot", "chat")
