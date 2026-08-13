from setuptools import setup, find_packages

setup(
    name="incllmv2",
    version="1.0.0",
    description="Self-improving LLM harness with universal recursive linking and RLOS",
    author="Incentives Inc — An AI Crypto Company",
    author_email="hawpetossjustin25@gmail.com",
    license="MIT",
    url="https://github.com/incentivesinc/incllmv2",
    packages=find_packages(),
    python_requires=">=3.11",
    install_requires=[
        "fastapi>=0.104.0",
        "uvicorn>=0.24.0",
        "pydantic>=2.0.0",
        "pyyaml>=6.0",
        "httpx>=0.25.0",
    ],
    extras_require={
        "full": [
            "chromadb>=0.4.0",
            "edge-tts>=6.1.0",
            "huggingface-hub>=0.20.0",
            "build>=1.0.0",
        ],
        "dev": [
            "pytest>=7.0",
            "pytest-asyncio>=0.21",
            "ruff>=0.1.0",
            "mypy>=1.0",
        ],
    },
    entry_points={
        "console_scripts": [
            "incllmv2-server=inc_llm.server:app",
        ],
    },
)
