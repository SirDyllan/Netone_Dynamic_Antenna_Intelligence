"""
Optional demonstration data generator.

This creates synthetic directional antenna data so the team can show that
training data exists without claiming it represents real NetOne telemetry.

It deliberately does not require scikit-learn so the project remains easy
to run on a student laptop.
"""

import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
output = ROOT / "data" / "demo_training_data.csv"

random.seed(42)

with output.open("w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)

    header = ["sample_id"] + [f"sector_{i*10}" for i in range(36)] + [
        "optimal_azimuth",
        "optimal_tilt"
    ]

    writer.writerow(header)

    for sample_id in range(1000):
        peak = random.randrange(0, 360, 10)
        values = []

        for angle in range(0, 360, 10):
            distance = abs((angle - peak + 180) % 360 - 180)
            score = max(0, 100 - distance * 2.4)
            score += random.uniform(0, 15)
            values.append(round(min(100, score), 2))

        maximum = max(values)
        optimal_tilt = 6 if maximum >= 85 else 7 if maximum >= 70 else 8

        writer.writerow([
            sample_id,
            *values,
            peak,
            optimal_tilt
        ])

print(f"Generated: {output}")
print("This is synthetic demonstration data, not live network data.")
