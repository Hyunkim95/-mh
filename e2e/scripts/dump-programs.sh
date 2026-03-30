#!/bin/bash
# Dumps program binaries from mainnet for local validator testing
# Requires: solana-cli installed

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/../fixtures"

echo "Dumping MultiHopperProject program..."
solana program dump \
  3jLoS2wbNgtKzieUUxwg6Xhdv6gbZkHDtPWA9ZAgspFh \
  "$FIXTURES_DIR/multi_hopper_project.so" \
  -u mainnet-beta

echo "Dumping TransferHookGuard program..."
solana program dump \
  2JEv3pD6nczEvn1xDXaEzehkJofPPjoQQpnW5nGY3r52 \
  "$FIXTURES_DIR/transfer_hook_guard.so" \
  -u mainnet-beta

echo "Dumping SPL Token-2022 program..."
solana program dump \
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb \
  "$FIXTURES_DIR/spl_token_2022.so" \
  -u mainnet-beta

echo "Done. Program binaries saved to $FIXTURES_DIR/"
