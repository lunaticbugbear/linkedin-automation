from project_package.core import summarize_metrics


def test_summarize_metrics_formats_output():
    result = summarize_metrics({"cpu": 10, "memory": 20, "disk": 30})
    assert "cpu=10" in result
    assert "memory=20" in result
    assert "disk=30" in result
