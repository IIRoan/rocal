from common import REPO, run, unpack

if __name__ == "__main__":
    run([unpack("actionlint", "actionlint"), *sorted((REPO / ".github/workflows").glob("native-e2e*.yml")), REPO / ".github/workflows/web-e2e.yml"])
