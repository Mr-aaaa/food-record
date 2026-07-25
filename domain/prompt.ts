import { localDateKey } from "@/domain/local-date";

export function buildSchemaPrompt(schemaVersion: string): string {
  return `必需的 JSON 结构：
{
  "schemaVersion": "${schemaVersion}",
  "recordId": "稳定的记录 ID",
  "date": "YYYY-MM-DD",
  "mealType": "breakfast | lunch | dinner | snack",
  "status": "planned | consumed",
  "rawText": "用户原始描述",
  "items": [{
    "itemId": "稳定的食物项 ID",
    "foodId": "稳定的食物 ID",
    "name": "食物名称",
    "amount": 0,
    "unit": "g | ml",
    "isAmbiguous": false,
    "nutrition": { "caloriesKcal": 0, "proteinG": 0, "fatG": 0, "carbohydrateG": 0 },
    "dataSource": { "type": "ai_estimated", "name": "来源", "confidence": 0, "isEstimated": true }
  }],
  "warnings": [],
  "createdAt": "带时区的 ISO 8601 时间",
  "updatedAt": "带时区的 ISO 8601 时间"
}`;
}

export function buildPortablePrompt(
  rawText: string,
  schemaVersion: string,
  date = localDateKey(new Date()),
): string {
  return `把用户的餐饮描述转换成 JSON，只输出 JSON，不要 Markdown 或解释。

要求：
- 食物名称要具体明确（例如「鸡胸肉」而不是「肉」）。仅当食物身份确实无法判断时才把 isAmbiguous 设为 true。
- 当用户没有写明份量时，给出一个合理的估算份量（克或毫升）填入 amount，并在 warnings 里注明「份量为估算」。尽量不要使用 null。
- nutrition 按该份量填写完整的热量与三大营养素（蛋白质 / 脂肪 / 碳水化合物），数值基于常见食物数据估算。
- 使用选定的本地日历日期 ${date}，不要推断为其他 UTC 日期。
- 保留用户的原始文字到 rawText。

用户输入：${rawText}

${buildSchemaPrompt(schemaVersion)}

示例：
{"schemaVersion":"${schemaVersion}","recordId":"meal_example_001","date":"${date}","mealType":"breakfast","status":"consumed","rawText":"两个鸡蛋","items":[{"itemId":"item_example_001","foodId":"food_egg","name":"鸡蛋","amount":100,"unit":"g","isAmbiguous":false,"nutrition":{"caloriesKcal":144,"proteinG":13.3,"fatG":8.8,"carbohydrateG":2.8},"dataSource":{"type":"ai_estimated","name":"估算","confidence":0.7,"isEstimated":true}}],"warnings":[],"createdAt":"${date}T08:00:00+08:00","updatedAt":"${date}T08:00:00+08:00"}`;
}

export function buildCorrectionPrompt(
  json: string,
  issues: string[],
  date = localDateKey(new Date()),
): string {
  return `修正下面的餐饮 JSON，只返回 JSON。保留选定的本地日期 ${date}。
需要修正的问题：
${issues.map((issue) => `- ${issue}`).join("\n")}

JSON：
${json}`;
}