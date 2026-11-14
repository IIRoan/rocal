import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from probe_subject_search import Probe, target, wait_until  # noqa: E402


VACATION = "urn:ietf:params:jmap:vacationresponse"
UPDATE = {
    "isEnabled": True,
    "fromDate": "2026-12-23T23:00:00Z",
    "toDate": "2027-01-04T23:00:00Z",
    "subject": "Away until January",
    "textBody": "I'm away and will reply when I'm back.",
    "htmlBody": None,
}


class SendFeaturesProbe(Probe):
    def vacation(self, method, arguments, session):
        account = session["primaryAccounts"].get(VACATION) or session["primaryAccounts"]["urn:ietf:params:jmap:mail"]
        return self.call_using(["urn:ietf:params:jmap:core", VACATION], method, {"accountId": account, **arguments})

    def call_using(self, using, method, arguments):
        body = json.dumps({"using": using, "methodCalls": [[method, arguments, "probe"]]}).encode()
        name, response, _ = self.request("/jmap/", body)["methodResponses"][0]
        if name != method:
            raise RuntimeError("Synthetic JMAP method refused")
        return response

    def run(self):
        session = wait_until(lambda: self.request("/jmap/session"))
        advertised = VACATION in session.get("capabilities", {})
        report = {"vacationAdvertised": advertised, "vacationRoundTrip": False}
        if advertised:
            updated = self.vacation("VacationResponse/set", {"update": {"singleton": UPDATE}}, session)
            listed = self.vacation("VacationResponse/get", {"ids": ["singleton"]}, session)["list"]
            stored = listed[0] if listed else {}
            report["vacationRoundTrip"] = "singleton" in updated.get("updated", {}) and all(
                stored.get(key) == value for key, value in UPDATE.items())
            self.vacation("VacationResponse/set", {"update": {"singleton": {"isEnabled": False}}}, session)
        report["passed"] = report["vacationAdvertised"] and report["vacationRoundTrip"]
        return report


def main():
    parser = argparse.ArgumentParser(description="Probe the JMAP send features the clients use on fresh, outbound-isolated PostgreSQL/Stalwart containers.")
    parser.add_argument("--assert", dest="assert_passed", action="store_true", help="Fail unless every feature behaves as the clients expect.")
    parser.add_argument("--image", default="localhost/solace-test-stalwart", help="Already-built local test image to exercise.")
    arguments = parser.parse_args()
    with target(arguments.image) as (base, _database, _server):
        report = SendFeaturesProbe(base).run()
        print(json.dumps(report, indent=2), flush=True)
    return 1 if arguments.assert_passed and not report["passed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
