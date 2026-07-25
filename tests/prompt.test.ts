import { parseImportedMeal } from "@/domain/input-schema";
import { buildPortablePrompt } from "@/domain/prompt";

test("instructs models to estimate portions and supplies a valid example", () => {
  const prompt = buildPortablePrompt("两个鸡蛋", "1.0");
  expect(prompt).toContain("份量为估算");
  expect(prompt).toContain('"isAmbiguous": false');
  const example = prompt.slice(prompt.indexOf('{"schemaVersion"'));
  expect(parseImportedMeal(example)).toMatchObject({ ok: true, canConfirm: true });
});