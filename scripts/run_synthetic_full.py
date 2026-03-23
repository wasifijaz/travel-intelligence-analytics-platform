"""
Full workflow: Generate synthetic data → Load to DB → Run analytics/forecast.
Usage: python scripts/run_synthetic_full.py
"""
import sys
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))


def main():
    print("=" * 60)
    print("Synthetic Data Pipeline")
    print("=" * 60)

    # 1. Generate synthetic data
    gen_script = PROJECT_ROOT / "data" / "synthetic" / "generate_synthetic_data.py"
    if not gen_script.exists():
        print(f"Error: {gen_script} not found")
        return
    print("\n1. Generating synthetic dataset...")
    subprocess.run([sys.executable, str(gen_script)], check=True)

    # 2. Load to database
    load_script = PROJECT_ROOT / "scripts" / "load_synthetic_to_pipeline.py"
    print("\n2. Loading to database...")
    subprocess.run([sys.executable, str(load_script)], check=True)

    # 3. Run forecast (optional)
    print("\n3. Run forecast? (python models/run_forecast.py)")
    print("   Run manually: python models/run_forecast.py")
    print("\n4. Launch dashboard: streamlit run dashboard/app.py")
    print("\nDone.")


if __name__ == "__main__":
    main()
