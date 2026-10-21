import fetch_ipu
import fetch_firms

if __name__ == '__main__':
    outcomes = [fetch_ipu.main(), fetch_firms.main()]
    if not all(outcomes):
        raise SystemExit(1)
