import pytest
import json
from unittest.mock import patch, MagicMock
from scripts.generate_ideas import generate_project_ideas

def test_generate_project_ideas_returns_list():
    with patch('scripts.generate_ideas.OpenAI') as mock_openai:
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices[0].message.content = json.dumps([
            {"title": "Project 1", "description": "Desc 1", "tech_stack": "Python", "repo_name": "project-1", "linkedin_post": "Post 1"},
            {"title": "Project 2", "description": "Desc 2", "tech_stack": "Python", "repo_name": "project-2", "linkedin_post": "Post 2"},
            {"title": "Project 3", "description": "Desc 3", "tech_stack": "Python", "repo_name": "project-3", "linkedin_post": "Post 3"}
        ])
        mock_client.chat.completions.create.return_value = mock_response

        ideas = generate_project_ideas(max_projects=3)
        assert isinstance(ideas, list)
        assert len(ideas) == 3

def test_each_idea_has_required_fields():
    with patch('scripts.generate_ideas.OpenAI') as mock_openai:
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_response = MagicMock()
        mock_response.choices[0].message.content = json.dumps([
            {"title": "Project 1", "description": "Desc", "tech_stack": "Python", "repo_name": "project-1", "linkedin_post": "Post"}
        ])
        mock_client.chat.completions.create.return_value = mock_response

        ideas = generate_project_ideas(max_projects=1)
        idea = ideas[0]
        required_fields = ["title", "description", "tech_stack", "repo_name", "linkedin_post"]
        for field in required_fields:
            assert field in idea, f"Missing field: {field}"
