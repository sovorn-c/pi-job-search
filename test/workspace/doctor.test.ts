import assert from "node:assert/strict";
import test from "node:test";
import { getDoctorReport } from "../../src/doctor.js";

test("doctor reports dependency presence without exposing environment values", () => {
  const secret = "super-secret-token";
  const report = getDoctorReport({
    NODE_VERSION: "20.11.0",
    PI_JOB_SEARCH_TOKEN: secret,
  });
  const serialized = JSON.stringify(report);

  assert.equal(report.node.supported, true);
  assert.equal(report.environment.PI_JOB_SEARCH_TOKEN.configured, true);
  assert.equal(report.environment.PI_JOB_SEARCH_TOKEN.value, "[redacted]");
  assert.equal(serialized.includes(secret), false);
});
