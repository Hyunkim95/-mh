#!/bin/bash

# Simple script to add missing hops to route 1027
# This generates the transaction that the user needs to sign

ROUTE_ID=1027
CREATOR="93AceAmSTY4sCkdwnaExuUj8nmaCVKijDHCABx49pTFw"

echo "🔧 Fixing Route $ROUTE_ID"
echo ""

# Calculate timestamps (10 minutes apart starting from now)
NOW=$(date +%s)000  # milliseconds
HOP1=$((NOW + 600000))    # +10 minutes
HOP2=$((NOW + 1200000))   # +20 minutes
HOP3=$((NOW + 1800000))   # +30 minutes
HOP4=$((NOW + 2400000))   # +40 minutes

echo "📝 Hops will be scheduled at:"
echo "   Hop 1: $(date -r $((HOP1 / 1000)) '+%Y-%m-%d %H:%M:%S')"
echo "   Hop 2: $(date -r $((HOP2 / 1000)) '+%Y-%m-%d %H:%M:%S')"
echo "   Hop 3: $(date -r $((HOP3 / 1000)) '+%Y-%m-%d %H:%M:%S')"
echo "   Hop 4: $(date -r $((HOP4 / 1000)) '+%Y-%m-%d %H:%M:%S')"
echo ""

# Create the JSON payload
read -r -d '' PAYLOAD <<EOF
{
  "routeId": $ROUTE_ID,
  "creator": "$CREATOR",
  "hops": [
    {"recipient": "h6gar47c9GxYda8Kkg5J9So3R9K3jhcWKbgrjKhqfst", "scheduledAt": $HOP1},
    {"recipient": "Data6X2sFNz6WFGJ5nXBCYMvyVvJUQh5oUJLkPd9pM58", "scheduledAt": $HOP2},
    {"recipient": "DRFTws1Segbxx6NYGfbxnJiTBi7m8wVuhwMfoY5RCXMD", "scheduledAt": $HOP3},
    {"recipient": "5UHMyYf1Md9dWfXEWGyaAv6uanMVvfKc9fkcbaL5yDYp", "scheduledAt": $HOP4}
  ]
}
EOF

echo "⏳ Generating addHops transactions..."
echo ""

# Call the API
RESPONSE=$(curl -s -X POST \
  "https://multi-hopper-staging-dd0bdc7cde11.herokuapp.com/trpc/contract.addHopsBatched" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "✅ Response from server:"
echo "$RESPONSE" | jq '.'
echo ""

echo "📋 What this did:"
echo "   • Generated transaction(s) to add 4 hops to route $ROUTE_ID"
echo "   • These transactions need to be signed by the creator's wallet"
echo ""

echo "🎯 Next Steps:"
echo "   1. The transactions are ready but need to be signed"
echo "   2. Have the user (Kuj Crypto) connect their wallet at:"
echo "      https://multi-hopper-staging-dd0bdc7cde11.herokuapp.com"
echo "   3. They should see the route and be able to retry adding hops"
echo ""
echo "   OR create a UI button that calls the addHopsMutation hook"
echo ""
