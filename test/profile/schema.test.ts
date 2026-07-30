import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyProfileSection,
  normalizeFacts,
  validateProfileSection,
  type ProfileSection,
} from "../../src/profile.js";

test("profile sections are versioned and require provenance on facts", () => {
  const section = emptyProfileSection("candidate");
  assert.equal(validateProfileSection(section), true);

  const withFact: ProfileSection = {
    ...section,
    fields: {
      name: {
        value: "Ada Lovelace",
        status: "confirmed",
        provenance: [{ source: "cv.md", kind: "cv" }],
      },
    },
  };
  assert.equal(validateProfileSection(withFact), true);
  assert.equal(
    validateProfileSection({ ...withFact, fields: { name: { value: "Ada", provenance: [] } } }),
    false,
  );
});

test("equivalent setup inputs normalize to the same canonical fact shape", () => {
  const fromCv = normalizeFacts({ name: "Ada" }, { source: "cv.pdf", kind: "cv" });
  const fromInterview = normalizeFacts({ name: "Ada" }, { source: "interview", kind: "interview" });
  assert.deepEqual(fromCv.name.value, fromInterview.name.value);
  assert.equal(fromCv.name.status, "confirmed");
});
