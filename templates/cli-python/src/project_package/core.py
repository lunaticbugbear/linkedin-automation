def summarize_metrics(metrics: dict) -> str:
    return ", ".join(f"{key}={value}" for key, value in metrics.items())
