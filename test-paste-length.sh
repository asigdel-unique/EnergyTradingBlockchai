#!/bin/bash
read -s -p "Paste the private key here to test its length (nothing will be shown): " testkey
echo
echo -n "$testkey" | wc -c
