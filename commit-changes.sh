#!/bin/sh
set -e

git add contracts/EnergyMarketplace.t.sol frontend/index.html frontend/src/App.css frontend/src/App.jsx frontend/src/EnergyMarketplaceABI.json package-lock.json package.json scripts/deploy-marketplace.js
git commit -m "Finish name snapshotting, rename support, ETH balance display, tx hash visibility, and flexible deploy network"
git push
