import pytest
from unittest.mock import patch, MagicMock
from scripts.main import run_cycle

def test_run_cycle_calls_all_steps():
    """Test that run_cycle calls all required steps."""
    with patch('scripts.main.load_config') as mock_config, \
         patch('scripts.main.generate_project_ideas') as mock_ideas, \
         patch('scripts.main.create_github_repo') as mock_repo, \
         patch('scripts.main.format_linkedin_post') as mock_post, \
         patch('scripts.main.send_notifications') as mock_notify:

        # Mock config
        mock_config.return_value = {
            "ai": {"max_projects": 3},
            "github": {"token": "test-token"}
        }

        # Mock ideas
        mock_ideas.return_value = [
            {
                "title": "Project 1",
                "description": "Description 1",
                "linkedin_post": "Post 1"
            }
        ]

        # Mock repo creation
        mock_repo.return_value = {"html_url": "https://github.com/user/repo"}

        # Mock post formatting
        mock_post.return_value = "Formatted Post 1"

        result = run_cycle()

        # Verify all steps were called
        assert mock_config.called
        assert mock_ideas.called
        assert mock_repo.called
        assert mock_post.called
        assert mock_notify.called

        # Verify result structure
        assert len(result) == 1
        assert result[0]["title"] == "Project 1"
        assert result[0]["repo_url"] == "https://github.com/user/repo"


def test_run_cycle_handles_repo_creation_failure():
    """Test that run_cycle continues when repo creation fails."""
    with patch('scripts.main.load_config') as mock_config, \
         patch('scripts.main.generate_project_ideas') as mock_ideas, \
         patch('scripts.main.create_github_repo') as mock_repo, \
         patch('scripts.main.send_notifications') as mock_notify:

        mock_config.return_value = {
            "ai": {"max_projects": 3},
            "github": {"token": "test-token"}
        }

        mock_ideas.return_value = [
            {"title": "Project 1", "description": "Desc 1", "linkedin_post": "Post 1"},
            {"title": "Project 2", "description": "Desc 2", "linkedin_post": "Post 2"}
        ]

        # First call fails, second succeeds
        mock_repo.side_effect = [
            Exception("API error"),
            {"html_url": "https://github.com/user/repo2"}
        ]

        result = run_cycle()

        # Should have 1 successful project
        assert len(result) == 1
        assert result[0]["title"] == "Project 2"
        assert mock_notify.called


def test_run_cycle_with_no_ideas():
    """Test that run_cycle handles empty ideas list."""
    with patch('scripts.main.load_config') as mock_config, \
         patch('scripts.main.generate_project_ideas') as mock_ideas, \
         patch('scripts.main.send_notifications') as mock_notify:

        mock_config.return_value = {
            "ai": {"max_projects": 3},
            "github": {"token": "test-token"}
        }

        mock_ideas.return_value = []

        result = run_cycle()

        assert len(result) == 0
        assert mock_notify.called
