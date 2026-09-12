#!/usr/bin/env bash
# Universal Ramm1 Installer — Unix/Linux/macOS
# Installs the RAMM1 OS as the Universal LLM Free System with the 3.5 GB RAM lock.
#
# Usage:
#   ./install.sh              — install
#   ./install.sh --uninstall  — uninstall
#   ./install.sh --status     — check status
#   ./install.sh --repair     — repair
#   ./install.sh --verify     — verify installation

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="${PYTHON:-python3}"

echo "========================================"
echo " Universal Ramm1 Installer"
echo " RAMM1 OS + Universal LLM Free System"
echo " 3.5 GB RAM Lock"
echo "========================================"
echo ""

if [ "$1" = "--status" ]; then
    echo "Checking installation status..."
    $PYTHON -c "import sys; sys.path.insert(0, '$PROJECT_DIR'); from inc_llm.ramm1.install import Ramm1Installer; import json; print(json.dumps(Ramm1Installer().status(), indent=2))"
    exit 0
fi

if [ "$1" = "--verify" ]; then
    echo "Verifying installation..."
    $PYTHON -c "import sys; sys.path.insert(0, '$PROJECT_DIR'); from inc_llm.ramm1.install import Ramm1Installer; import json; print(json.dumps(Ramm1Installer().verify(), indent=2))"
    exit 0
fi

if [ "$1" = "--uninstall" ]; then
    echo "Uninstalling Universal Ramm1..."
    $PYTHON -c "import sys; sys.path.insert(0, '$PROJECT_DIR'); from inc_llm.ramm1.install import Ramm1Installer; import json; r = Ramm1Installer().uninstall(); print(json.dumps(r.to_dict(), indent=2))"
    echo "Uninstall complete."
    exit 0
fi

if [ "$1" = "--repair" ]; then
    echo "Repairing Universal Ramm1..."
    $PYTHON -c "import sys; sys.path.insert(0, '$PROJECT_DIR'); from inc_llm.ramm1.install import Ramm1Installer; import json; r = Ramm1Installer().repair(); print(json.dumps(r.to_dict(), indent=2))"
    echo "Repair complete."
    exit 0
fi

# Install
echo "Installing Universal Ramm1..."
echo "  Project: $PROJECT_DIR"
echo "  Python: $PYTHON"
echo ""

$PYTHON -c "import sys; sys.path.insert(0, '$PROJECT_DIR'); from inc_llm.ramm1.install import Ramm1Installer; import json; r = Ramm1Installer().install(); print(json.dumps(r.to_dict(), indent=2)); sys.exit(0 if r.success else 1)"

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================"
    echo " Installation Successful!"
    echo "========================================"
    echo ""
    echo "The Universal LLM Free System is installed."
    echo "The RAMM1 OS resource layer is active with the 3.5 GB RAM lock."
    echo ""
    echo "API: http://localhost:8547/v1/ramm1/status"
    echo "CLI: ramm1 status"
    echo ""
    echo "To start the server:"
    echo "  cd $PROJECT_DIR"
    echo "  $PYTHON -m inc_llm.server"
else
    echo ""
    echo "========================================"
    echo " Installation Failed!"
    echo "========================================"
    echo "Check the output above for errors."
    exit 1
fi
