"""
Code execution engine for Jupyter-style notebook cells.

Executes code snippets in a subprocess with timeout protection.
Supported: Python, JavaScript (Node.js), Bash, Go, TypeScript.
"""

import os
import subprocess
from dataclasses import dataclass

TIMEOUT_SECONDS = 30 # Increased to allow for lazy docker pulls
CODE_EXECUTION_DISABLED_MESSAGE = (
    "Code execution is disabled for this backend. Set CODE_EXECUTION_ENABLED=true "
    "and ensure Docker is reachable from the backend runtime to enable it."
)

# language id → docker command parts
LANG_CONFIG: dict[str, list[str]] = {
    # Run python securely with 128M memory and no network
    "python":     ["docker", "run", "--rm", "-i", "--net=none", "--memory=128m", "python:3.11-slim", "python3"],
    # Run node
    "javascript": ["docker", "run", "--rm", "-i", "--net=none", "--memory=128m", "node:20-alpine", "node"],
    # Run bash
    "bash":       ["docker", "run", "--rm", "-i", "--net=none", "--memory=64m", "bash:5", "bash"],
    # Go needs a file, so we pipe to cat > main.go and then go run
    "go":         ["docker", "run", "--rm", "-i", "--net=none", "--memory=256m", "golang:1.21-alpine", "sh", "-c", "cat > main.go && go run main.go"],
    # Deno runs TypeScript natively from stdin very fast
    "typescript": ["docker", "run", "--rm", "-i", "--net=none", "--memory=128m", "denoland/deno:alpine", "run", "-"],
}

SUPPORTED_LANGUAGES = set(LANG_CONFIG.keys())


@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool


def code_execution_enabled() -> bool:
    value = os.getenv("CODE_EXECUTION_ENABLED", "true").strip().lower()
    return value not in {"0", "false", "no", "off"}


def execute_code(language: str, code: str) -> ExecutionResult:
    """Run a code snippet and return its output."""
    if language not in LANG_CONFIG:
        raise ValueError(f"Unsupported language: {language}")

    cmd_parts = LANG_CONFIG[language]

    try:
        result = subprocess.run(
            cmd_parts,
            input=code,           # Pass code via stdin
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        return ExecutionResult(
            stdout=result.stdout,
            stderr=result.stderr,
            exit_code=result.returncode,
            timed_out=False,
        )
    except subprocess.TimeoutExpired:
        return ExecutionResult(
            stdout="",
            stderr=f"Execution timed out after {TIMEOUT_SECONDS}s",
            exit_code=-1,
            timed_out=True,
        )
    except FileNotFoundError:
        return ExecutionResult(
            stdout="",
            stderr="Docker CLI is not available in the backend runtime.",
            exit_code=-1,
            timed_out=False,
        )
