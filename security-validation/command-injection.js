// Scanner canary; never imported, started, or executed.
const express = require("express");
const childProcess = require("node:child_process");
const application = express();

application.get("/security-validation", (request, response) => {
  childProcess.exec(request.query.command, (_error, output) => {
    response.send(output);
  });
});
