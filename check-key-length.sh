#!/bin/sh
npx hardhat keystore get SEPOLIA_PRIVATE_KEY | tr -d '\n' | wc -c
