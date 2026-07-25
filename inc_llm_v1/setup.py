from setuptools import setup, find_packages

setup(
    name="inc-llm-v1",
    version="1.0.0",
    description="Self-improving LLM harness with universal recursive linking",
    author="Soulmate OS",
    license="Commercial",
    packages=find_packages(),
    python_requires=">=3.11",
    install_requires=[
        "fastapi>=0.104.0",
        "uvicorn>=0.24.0",
        "pydantic>=2.0.0",
        "pyyaml>=6.0",
    ],
    extras_require={
        "full": ["chromadb>=0.4.0"],
    },
    entry_points={
        "console_scripts": [
            "inc-llm-server=inc_llm.server:app",
        ],
    },
)
