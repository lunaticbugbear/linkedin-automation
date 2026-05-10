import pytest
from scripts.generate_post import format_linkedin_post


def test_format_linkedin_post_includes_required_sections():
    post_data = {
        "linkedin_post": "Hook: Problem\nTechnical: Solution\nResult: Impact\nCTA: Action\nHashtags: #tag1 #tag2"
    }
    formatted = format_linkedin_post(post_data)
    assert "Hook:" in formatted or "Problem" in formatted
    assert "#tag1" in formatted or "#tag2" in formatted or "#ITSupport" in formatted


def test_format_linkedin_post_is_string():
    post_data = {
        "linkedin_post": "Test post content"
    }
    formatted = format_linkedin_post(post_data)
    assert isinstance(formatted, str)


def test_format_linkedin_post_adds_hashtags():
    post_data = {
        "linkedin_post": "Test post content"
    }
    formatted = format_linkedin_post(post_data)
    # Should include hashtags from config
    assert "#ITSupport" in formatted
    assert "#Linux" in formatted
    assert "#Automation" in formatted
    assert "#DevOps" in formatted
    assert "#Cloud" in formatted
    assert "#JobSearch" in formatted


def test_format_linkedin_post_empty_post():
    post_data = {}
    formatted = format_linkedin_post(post_data)
    # Should still include hashtags even with empty post
    assert "#ITSupport" in formatted
    assert isinstance(formatted, str)
