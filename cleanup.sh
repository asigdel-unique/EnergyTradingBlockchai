#!/bin/sh
set -e

git rm .claude CLAUDE.md AGENTS.md deploy.log contracts/EnergyTrading.sol scripts/deploy.js
git rm -r .agents
printf '.claude\n.agents\nCLAUDE.md\nAGENTS.md\ndeploy.log\n' >> .gitignore
git add .gitignore
git commit -m "Remove Claude tooling files and abandoned prototype contract"
git push
