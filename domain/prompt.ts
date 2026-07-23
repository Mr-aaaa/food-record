export function buildPortablePrompt(rawText: string, schemaVersion: string): string {
  return `Convert the user's meal description into JSON only, with no Markdown or explanation.

Set isAmbiguous to true when a food name, preparation, unit conversion, or identity has multiple plausible interpretations. Set it to false only when the food is identified clearly. Use amount: null for an unknown amount and add a warning. Preserve the user's original text.

User input: ${rawText}

Required JSON schema:
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
}

Example:
{"schemaVersion":"${schemaVersion}","recordId":"meal_example_001","date":"2026-07-23","mealType":"breakfast","status":"consumed","rawText":"two eggs","items":[{"itemId":"item_example_001","foodId":"food_egg","name":"egg","amount":100,"unit":"g","isAmbiguous":false,"nutrition":{"caloriesKcal":143,"proteinG":12.6,"fatG":9.5,"carbohydrateG":0.7},"dataSource":{"type":"ai_estimated","name":"estimate","confidence":0.7,"isEstimated":true}}],"warnings":[],"createdAt":"2026-07-23T08:00:00+08:00","updatedAt":"2026-07-23T08:00:00+08:00"}`;
}
