from unittest.mock import patch, MagicMock
from scripts.notify import (
    send_project_options,
    wait_for_project_selection,
    answer_callback_query,
    send_final_project,
    format_success_message,
    format_failure_message,
)


def test_send_project_options_sends_inline_keyboard():
    ideas = [
        {"title": "SLA Radar", "function": "Tracks SLA risk", "use_case": "Shows incident automation"},
        {"title": "Linux Pulse", "function": "Checks server health", "use_case": "Shows Linux monitoring"},
        {"title": "Access Guard", "function": "Reviews user access", "use_case": "Shows security operations"},
    ]

    with patch("scripts.notify.requests.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"ok": True, "result": {"message_id": 123}}
        mock_post.return_value = mock_response

        message_id = send_project_options(ideas, "token", "chat")

        assert message_id == 123
        payload = mock_post.call_args.kwargs["json"]
        assert payload["reply_markup"]["inline_keyboard"][0] == [
            {"text": "Pilih 1", "callback_data": "project:0"},
            {"text": "Pilih 2", "callback_data": "project:1"},
            {"text": "Pilih 3", "callback_data": "project:2"},
        ]
        assert payload["reply_markup"]["inline_keyboard"][1] == [
            {"text": "Ganti Semua", "callback_data": "regenerate_all"},
        ]
        assert "SLA Radar" in payload["text"]
        assert "Fungsi: Tracks SLA risk" in payload["text"]


def test_wait_for_project_selection_returns_selected_index():
    with patch("scripts.notify.time.monotonic", side_effect=[0, 1]), patch("scripts.notify.requests.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "ok": True,
            "result": [
                {
                    "update_id": 10,
                    "callback_query": {
                        "id": "cb1",
                        "data": "project:1",
                        "message": {"chat": {"id": "chat"}, "message_id": 123},
                    },
                }
            ],
        }
        mock_get.return_value = mock_response

        selection = wait_for_project_selection("token", "chat", 123, timeout_seconds=30)

        assert selection == {"index": 1, "callback_query_id": "cb1"}


def test_answer_callback_query_calls_telegram_api():
    with patch("scripts.notify.requests.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        result = answer_callback_query("token", "cb1", "Dipilih")

        assert result is True
        assert "answerCallbackQuery" in mock_post.call_args.args[0]


def test_success_and_failure_message_formatting():
    success = format_success_message(
        repo_url="https://github.com/example/project",
        project_type="web-app-nextjs",
        ci_status="passed",
        vercel_url="https://example.vercel.app",
        run_commands=["npm install", "npm run build"],
        linkedin_post="Built this today.",
    )
    failure = format_failure_message({"stage": "build_failed", "error": "boom", "log_url": "https://logs"})
    assert "Project ready" in success
    assert "https://example.vercel.app" in success
    assert "build_failed" in failure


def test_send_final_project_sends_text_and_photo():
    project = {
        "title": "SLA Radar",
        "repo_url": "https://github.com/example/project-sla-radar",
        "linkedin_post": "Built an SLA radar today.",
        "project_type": "cli-python",
        "ci_status": "passed",
        "run_commands": ["python -m pytest"],
        "vercel_url": None,
    }

    with patch("scripts.notify.requests.post") as mock_post, patch("builtins.open", create=True):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        result = send_final_project(project, "C:/tmp/banner.png", "token", "chat")

        assert result is True
        assert mock_post.call_count == 2
        assert "sendMessage" in mock_post.call_args_list[0].args[0]
        payload = mock_post.call_args_list[0].kwargs["json"]
        assert payload["reply_markup"]["inline_keyboard"] == [
            [
                {"text": "Regenerate Post", "callback_data": "regenerate_post"},
                {"text": "Selesai", "callback_data": "done"},
            ]
        ]
        assert "sendPhoto" in mock_post.call_args_list[1].args[0]
