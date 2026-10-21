import fetch_ipu
import fetch_firms
import archive_data

if __name__ == '__main__':
    archive_data.capture()
    outcomes = [fetch_ipu.main(), fetch_firms.main()]
    archive_data.capture()
    if not all(outcomes):
        raise SystemExit(1)
