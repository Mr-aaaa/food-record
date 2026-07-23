import { localDateKey } from "@/domain/local-date";

export function buildSchemaPrompt(schemaVersion: string): string {
  return `Required JSON schema:
{
  "schemaVersion": "${schemaVersion}",
  "recordId": "stable record ID",
  "date": "YYYY-MM-DD",
  "mealType": "breakfast | lunch | dinner | snack",
  "status": "planned | consumed",
  "rawText": "original text",
  "items": [{
    "itemId": "stable item ID",
    "foodId": "stable food ID",
    "name": "food name",
    "amount": 0,
    "unit": "g | ml",
    "isAmbiguous": false,
    "nutrition": { "caloriesKcal": 0, "proteinG": 0, "fatG": 0, "carbohydrateG": 0 },
    "dataSource": { "type": "ai_estimated", "name": "source", "confidence": 0, "isEstimated": true }
  }],
  "warnings": [],
  "createdAt": "ISO 8601 timestamp with offset",
  "updatedAt": "ISO 8601 timestamp with offset"
}`;
}

export function buildPortablePrompt(
  rawText: string,
  schemaVersion: string,
  date = localDateKey(new Date()),
): string {
  return `Convert the user's meal description into JSON only, with no Markdown or explanation.

Set isAmbiguous to true when a food name, preparation, unit conversion, or identity has multiple plausible interpretations. Set it to false only when the food is identified clearly. Use amount: null for an unknown amount and add a warning. Preserve the user's original text.
Use the selected local calendar date ${date}; do not infer a different UTC date.

User input: ${rawText}

${buildSchemaPrompt(schemaVersion)}

Example:
{"schemaVersion":"${schemaVersion}","recordId":"meal_example_001","date":"${date}","mealType":"breakfast","status":"consumed","rawText":"two eggs","items":[{"itemId":"item_example_001","foodId":"food_egg","name":"egg","amount":100,"unit":"g","isAmbiguous":false,"nutrition":{"caloriesKcal":143,"proteinG":12.6,"fatG":9.5,"carbohydrateG":0.7},"dataSource":{"type":"ai_estimated","name":"estimate","confidence":0.7,"isEstimated":true}}],"warnings":[],"createdAt":"${date}T08:00:00+08:00","updatedAt":"${date}T08:00:00+08:00"}`;
}

export function buildCorrectionPrompt(
  json: string,
  issues: string[],
  date = localDateKey(new Date()),
): string {
  return `Correct the following meal JSON. Return JSON only. Keep the selected local date ${date}.
Problems to fix:
${issues.map((issue) => `- ${issue}`).join("\n")}

JSON:
${json}`;
}
