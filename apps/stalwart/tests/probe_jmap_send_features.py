import argparse
from datetime import datetime, timedelta, timezone
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from probe_subject_search import Probe, target, wait_until  # noqa: E402


VACATION = "urn:ietf:params:jmap:vacationresponse"
SUBMISSION = "urn:ietf:params:jmap:submission"
SEND_USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", SUBMISSION]
SENDER = "noreply@solace.test"
EXTERNAL = "probe@example.com"
SUBJECT = "solace send hold probe "
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

    def send_calls(self, calls):
        body = json.dumps({"using": SEND_USING, "methodCalls": calls}).encode()
        return [response for _, response, _ in self.request("/jmap/", body)["methodResponses"]]

    def submit(self, context, recipient, parameters, label, destroy=False):
        account, drafts, identity = context
        email = {"mailboxIds": {drafts: True}, "keywords": {"$draft": True}, "from": [{"email": SENDER}],
                 "to": [{"email": recipient}], "subject": SUBJECT + label,
                 "textBody": [{"partId": "t", "type": "text/plain"}], "bodyValues": {"t": {"value": "Probe."}}}
        submission = {"accountId": account, "create": {"s": {"identityId": identity, "emailId": "#d", "envelope": {
            "mailFrom": {"email": SENDER, "parameters": parameters}, "rcptTo": [{"email": recipient}]}}}}
        if destroy:
            submission["onSuccessDestroyEmail"] = ["#s"]
        created, submitted, *implicit = self.send_calls([["Email/set", {"accountId": account, "create": {"d": email}}, "0"],
                                              ["EmailSubmission/set", submission, "1"]])
        return created["created"]["d"]["id"], {**submitted, "destroyed": implicit[0].get("destroyed", []) if implicit else []}

    def cancel(self, account, submission_id):
        return self.send_calls([["EmailSubmission/set", {"accountId": account,
                                 "update": {submission_id: {"undoStatus": "canceled"}}}, "0"]])[0]

    def pending_ids(self, account):
        return self.send_calls([["EmailSubmission/query", {"accountId": account,
                                 "filter": {"undoStatus": "pending"}}, "0"]])[0]["ids"]

    def inbox_subjects(self, account, inbox):
        _, listed = self.send_calls([
            ["Email/query", {"accountId": account, "filter": {"inMailbox": inbox, "subject": SUBJECT.strip()}}, "q"],
            ["Email/get", {"accountId": account, "#ids": {"resultOf": "q", "name": "Email/query", "path": "/ids"},
                           "properties": ["subject"]}, "g"]])
        return {email["subject"] for email in listed["list"]}

    def holds(self, session):
        account = session["primaryAccounts"]["urn:ietf:params:jmap:mail"]
        capability = session["accounts"][account]["accountCapabilities"].get(SUBMISSION, {})
        report = {"maxDelayedSend": capability.get("maxDelayedSend", 0),
                  "futureRelease": "FUTURERELEASE" in capability.get("submissionExtensions", {})}
        mailboxes = self.call("Mailbox/get", {"accountId": account})["list"]
        roles = {mailbox.get("role"): mailbox["id"] for mailbox in mailboxes}
        identity = self.send_calls([["Identity/get", {"accountId": account}, "0"]])[0]["list"][0]["id"]
        context = (account, roles["drafts"], identity)
        try:
            started = time.time()
            _, held = self.submit(context, SENDER, {"HOLDFOR": "600"}, "held")
            created = held.get("created", {}).get("s", {})
            send_at = datetime.fromisoformat(created.get("sendAt", "1970-01-01T00:00:00Z")).timestamp()
            report["holdForPending"] = created.get("undoStatus") == "pending" and abs(send_at - started - 600) < 30
            report["pendingQueried"] = created.get("id") in self.pending_ids(account)
            report["cancelUpdated"] = created.get("id") in self.cancel(account, created.get("id", "")).get("updated", {})
            _, short = self.submit(context, SENDER, {"HOLDFOR": "5"}, "canceled")
            canceled = short.get("created", {}).get("s", {}).get("id", "")
            short_canceled = canceled in self.cancel(account, canceled).get("updated", {})
            self.submit(context, SENDER, {"HOLDFOR": "8"}, "control")

            def delivered():
                subjects = self.inbox_subjects(account, roles["inbox"])
                if SUBJECT + "control" not in subjects:
                    raise RuntimeError("Control message not delivered yet")
                return subjects

            report["canceledNeverDelivered"] = short_canceled and SUBJECT + "canceled" not in wait_until(delivered)
            report["cannotUnsendAfterSend"] = self.cancel(account, canceled).get("notUpdated", {}).get(
                canceled, {}).get("type") == "cannotUnsend"
            beyond = (datetime.now(timezone.utc) + timedelta(days=8)).strftime("%Y-%m-%dT%H:%M:%SZ")
            _, late = self.submit(context, SENDER, {"HOLDUNTIL": beyond}, "beyond")
            report["holdUntilBeyondLimitRefused"] = "s" in late.get("notCreated", {})
            within = (datetime.now(timezone.utc) + timedelta(days=6)).strftime("%Y-%m-%dT%H:%M:%SZ")
            _, scheduled = self.submit(context, SENDER, {"HOLDUNTIL": within}, "scheduled")
            scheduled_id = scheduled.get("created", {}).get("s", {}).get("id", "")
            report["holdUntilWithinLimitPending"] = scheduled.get("created", {}).get("s", {}).get("undoStatus") == "pending"
            self.cancel(account, scheduled_id)
            email_id, external = self.submit(context, EXTERNAL, {"HOLDFOR": "600"}, "external", destroy=True)
            external_id = external.get("created", {}).get("s", {}).get("id", "")
            report["externalDestroyedWhilePending"] = email_id in external.get("destroyed", []) and external_id in self.pending_ids(account)
            report["externalCancelUpdated"] = external_id in self.cancel(account, external_id).get("updated", {})
        finally:
            for submission_id in self.pending_ids(account):
                self.cancel(account, submission_id)
            found = self.call("Email/query", {"accountId": account, "filter": {"subject": SUBJECT.strip()}})["ids"]
            if found:
                self.call("Email/set", {"accountId": account, "destroy": found})
        checks = [value for key, value in report.items() if key != "maxDelayedSend"]
        report["passed"] = report["maxDelayedSend"] > 0 and all(value is True for value in checks)
        return report

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
        report["holds"] = self.holds(session)
        report["passed"] = report["vacationAdvertised"] and report["vacationRoundTrip"] and report["holds"]["passed"]
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
