import { buildPortablePrompt } from "@/domain/prompt";

test("includes raw text, schema version and JSON-only instruction", () => {
  const prompt = buildPortablePrompt("早餐两个鸡蛋", "1.0");

  expect(prompt).toContain("早餐两个鸡蛋");
  expect(prompt).toContain('schemaVersion 必须为 "1.0"');
  expect(prompt).toContain("只输出合法 JSON");
  expect(prompt).toContain('"foodId": "稳定食物 ID"');
});
