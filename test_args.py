import sys
import argparse

print("=" * 60)
print("ARGUMENT TEST")
print("=" * 60)
print(f"Raw sys.argv: {sys.argv}")
print()

parser = argparse.ArgumentParser()
parser.add_argument("--tradingview-path", type=str)
parser.add_argument("--ctrader-path", type=str)
parser.add_argument("--unlock-minutes", type=int)

args = parser.parse_args()
print(f"Parsed tradingview-path: {args.tradingview_path}")
print(f"Parsed ctrader-path: {args.ctrader_path}")
print(f"Parsed unlock-minutes: {args.unlock_minutes}")
print("=" * 60)