import typer
from .core import summarize_metrics

app = typer.Typer()


@app.command()
def main() -> None:
    result = summarize_metrics({"cpu": 10, "memory": 20, "disk": 30})
    typer.echo(result)
