import contextlib
import importlib.util
import io
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("deploy_web", Path(__file__).with_name("deploy-web-container.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
IMAGE = "vcr.vercel.com/team/project/web@sha256:" + "a" * 64
ENV = {"VERCEL_PROJECT_ID": "prj_test", "VERCEL_ORG_ID": "team_test", "VERCEL_TOKEN": "test-token", "NEXT_PUBLIC_API_URL": "https://api.example.test"}


class Response(io.BytesIO):
    def __init__(self, body, headers=None):
        super().__init__(body)
        self.status = 200
        self.headers = headers or {}


class DeploymentTests(unittest.TestCase):
    def run_deploy(self, arguments, *, bad_csp=False, bad_project=False, bad_host=False, bad_root=False):
        candidate = {"id": "dpl_test", "projectId": "other" if bad_project else "prj_test", "url": "foreign.example.test" if bad_host else "candidate.vercel.app", "readyState": "READY", "createdAt": 1000}
        calls = []

        def open_request(request, **_kwargs):
            calls.append(request)
            if request.full_url.startswith("https://api.vercel.com/"):
                data = {"id": "prj_test", "name": "project", "rootDirectory": "apps/web" if bad_root else None, "protectionBypass": {"test-bypass": {}}} if "/projects/" in request.full_url else candidate
                return Response(json.dumps(data).encode())
            if request.full_url.endswith("/login"):
                return Response(b'<script src="/_next/static/test.js"></script>', {"Content-Type": "text/html", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'" if bad_csp else "connect-src https://api.example.test"})
            return Response(b"test script", {"Content-Type": "application/javascript"})

        with patch.dict(os.environ, ENV), patch("sys.argv", ["deploy", "--image", IMAGE, *arguments]), patch.object(deploy.urllib.request, "build_opener") as build_opener, patch.object(deploy.subprocess, "run") as promote, contextlib.redirect_stdout(io.StringIO()):
            build_opener.return_value.open.side_effect = open_request
            try:
                deploy.main()
            except (ValueError, AssertionError):
                promote.assert_not_called()
                raise
            return calls, promote

    def test_check_only_never_sends_requests(self):
        calls, promote = self.run_deploy([])
        self.assertEqual(calls, [])
        promote.assert_not_called()

    def test_preview_checks_assets_without_promoting(self):
        calls, promote = self.run_deploy(["--apply", "--preview"])
        self.assertTrue(any("/_next/static/" in request.full_url for request in calls))
        promote.assert_not_called()
        payload = json.loads(next(request.data for request in calls if request.get_method() == "POST"))
        self.assertEqual(payload["files"][1], {"file": "Dockerfile.vercel", "data": "FROM " + IMAGE + "\n"})
        self.assertFalse(payload["autoAssignCustomDomains"])
        for request in calls:
            if "Authorization" in request.headers:
                self.assertTrue(request.full_url.startswith("https://api.vercel.com/"))

    def test_missing_api_csp_stops_promotion(self):
        with self.assertRaises(AssertionError):
            self.run_deploy(["--apply"], bad_csp=True)

    def test_production_candidate_stays_unpromoted(self):
        calls, promote = self.run_deploy(["--apply", "--candidate"])
        payload = json.loads(next(request.data for request in calls if request.get_method() == "POST"))
        self.assertEqual(payload["target"], "production")
        self.assertFalse(payload["autoAssignCustomDomains"])
        promote.assert_not_called()

    def test_wrong_project_stops_promotion(self):
        with self.assertRaises(ValueError):
            self.run_deploy(["--apply"], bad_project=True)

    def test_foreign_host_stops_promotion(self):
        with self.assertRaises(ValueError):
            self.run_deploy(["--apply"], bad_host=True)

    def test_wrong_project_root_stops_deployment(self):
        with self.assertRaises(ValueError):
            self.run_deploy(["--apply"], bad_root=True)

    def test_mutable_image_is_rejected(self):
        with patch.dict(os.environ, ENV), patch("sys.argv", ["deploy", "--image", "vcr.vercel.com/team/project/web:latest"]):
            with self.assertRaises(ValueError):
                deploy.main()


if __name__ == "__main__":
    unittest.main()
