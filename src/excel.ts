import * as XLSX from "xlsx";
import { Person, Roster } from "./types";

const TEMPLATE_SHEET_NAME = "名单";

export function exportTemplate(filename = "点名名单模板.xlsx") {
  const header = [["姓名", "学号/工号", "分组", "备注"]];
  const exampleRow = [["张三", "20260001", "一组", "示例数据，可删除"]];

  const ws = XLSX.utils.aoa_to_sheet([...header, ...exampleRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET_NAME);

  XLSX.writeFile(wb, filename);
}

export async function importRosterFromFile(
  file: File
): Promise<Omit<Roster, "id" | "createdAt">> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("未找到工作表");
  }

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: 1,
    raw: false,
  }) as (string | undefined)[][];

  const [, ...rows] = json;

  const people: Person[] = [];

  rows.forEach((row, index) => {
    const [name, id, group, extra] = row;
    const trimmedName = (name ?? "").toString().trim();
    if (!trimmedName) {
      return;
    }
    people.push({
      id: (id ?? `${index + 1}`).toString().trim(),
      name: trimmedName,
      group: group?.toString().trim() || undefined,
      extra: extra?.toString().trim() || undefined,
    });
  });

  if (people.length === 0) {
    throw new Error("未在表格中解析到有效的名单数据");
  }

  const baseName =
    file.name.replace(/\.[^.]+$/, "") || `导入名单_${new Date().toISOString()}`;

  return {
    name: baseName,
    people,
  };
}
