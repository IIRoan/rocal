from common import REPO, run, unpack

if __name__ == "__main__":
    run([unpack("actionlint", "actionlint"), REPO / ".github/workflows/native-e2e.yml"])
