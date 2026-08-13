# Contributing to incllmv2

Thank you for your interest in contributing to incllmv2! This document outlines the process for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/incentivesinc/incllmv2.git`
3. Create a virtual environment: `python -m venv venv && source venv/bin/activate`
4. Install dependencies: `pip install -e ".[full]"`
5. Install dev dependencies: `pip install pytest ruff mypy`

## Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature-name`
2. Make your changes following the code style below
3. Run tests: `pytest tests/`
4. Run linter: `ruff check inc_llm/`
5. Run type checker: `mypy inc_llm/`
6. Commit with conventional commits: `git commit -m "feat: add new feature"`
7. Push and create a pull request

## Code Style

- Python 3.11+ required
- Use `from __future__ import annotations` in all files
- Type hints required on all public functions
- Max line length: 100 characters
- Follow PEP 8 (enforced by ruff)
- No comments unless explicitly requested or documenting complex algorithms

## Testing

- Write tests for all new features
- Place tests in `tests/` directory
- Use pytest as the test framework
- Aim for >80% coverage on new code

## Pull Request Process

1. Ensure all tests pass: `pytest tests/`
2. Ensure linting passes: `ruff check inc_llm/`
3. Ensure type checking passes: `mypy inc_llm/`
4. Update documentation if needed
5. Request review from maintainers

## Reporting Issues

- Use GitHub Issues to report bugs
- Include Python version, OS, and steps to reproduce
- For security issues, email hawpetossjustin25@gmail.com directly

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
