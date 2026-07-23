import { parseImportedMeal } from "@/domain/input-schema";
import { buildPortablePrompt } from "@/domain/prompt";

test("instructs models to mark every plausible identity ambiguity and supplies a valid example", () => {
  const prompt = buildPortablePrompt("two eggs", "1.0");
  expect(prompt).toContain("food name, preparation, unit conversion, or identity");
  expect(prompt).toContain('"isAmbiguous": false');
  const example = prompt.slice(prompt.indexOf('{"schemaVersion"'));
  expect(parseImportedMeal(example)).toMatchObject({ ok: true, canConfirm: true });
});
