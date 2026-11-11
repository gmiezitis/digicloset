#!/bin/sh
# Compiles the plan rules with the tests and runs them on this Mac (no simulator needed).
# Only the pure rules are tested; the Entitlements class (app-only) is left out.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$(mktemp -d)"
sed '/^\/\/\/ The user.s current plan/,$d' "$ROOT/DigiCloset/Services/Plans.swift" > "$OUT/Plans.swift"
cp "$ROOT/Tools/plan-tests/PlanTests.swift" "$OUT/main.swift"
xcrun swiftc -swift-version 6 -o "$OUT/plantests" "$ROOT/DigiCloset/Models/Kinds.swift" "$OUT/Plans.swift" "$OUT/main.swift"
"$OUT/plantests"
