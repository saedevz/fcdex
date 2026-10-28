export interface CopyBlock {
  table: string;
  columns: string[];
  rows: string[][];
}

export interface ParsedDump {
  ddl: string[];
  foreignKeys: string[];
  blocks: CopyBlock[];
}

export function sanitizeDump(raw: string): string[] {
  const lines = raw.split("\n");
  const cleaned: string[] = [];

  for (const line of lines) {
    if (line.startsWith("\\restrict") || line.startsWith("\\unrestrict"))
      continue;
    if (line.startsWith("ALTER TABLE public.") && line.includes(" OWNER TO "))
      continue;

    cleaned.push(line);
  }

  return cleaned;
}

export function parseDump(source: string[]): ParsedDump {
  const ddl: string[] = [];
  const foreignKeys: string[] = [];
  const blocks: CopyBlock[] = [];

  let index = 0;

  while (index < source.length) {
    const line = source[index] ?? "";

    const copyMatch = /^COPY public\.(\w+) \(([^)]*)\) FROM stdin;$/.exec(line);

    if (!copyMatch) {
      ddl.push(line);
      index += 1;
      continue;
    }

    const table = copyMatch[1] ?? "";
    const columns = (copyMatch[2] ?? "")
      .split(",")
      .map((entry) => entry.trim().replace(/^"|"$/g, ""));

    index += 1;
    const rows: string[][] = [];

    while (index < source.length) {
      const row = source[index] ?? "";

      if (row === "\\.") break;

      rows.push(splitCopyRow(row));
      index += 1;
    }

    blocks.push({ table, columns, rows });
    index += 1;
  }

  return { ddl, foreignKeys, blocks };
}

export function splitStatements(ddlLines: string[]): {
  plain: string[];
  foreignKeys: string[];
} {
  const script = ddlLines.join("\n");

  const statements = script
    .split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter(
      (statement) => statement.length > 0 && !statement.startsWith("\\."),
    );

  const plain: string[] = [];
  const foreignKeys: string[] = [];

  for (const statement of statements) {
    if (isForeignKey(statement)) {
      foreignKeys.push(statement);
    } else {
      plain.push(statement);
    }
  }

  return { plain, foreignKeys };
}

function isForeignKey(statement: string): boolean {
  return /ADD CONSTRAINT[\s\S]*FOREIGN KEY/.test(statement);
}

export function splitCopyRow(row: string): string[] {
  const fields: string[] = [];
  let current = "";
  let escaped = false;

  for (const char of row) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      current += char;
      continue;
    }

    if (char === "\t") {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

export function unescapeCopy(value: string): string {
  return value.replace(/\\(x[0-9a-fA-F]{2}|.)/g, (_, token: string) => {
    if (token === "n") return "\n";
    if (token === "r") return "\r";
    if (token === "t") return "\t";
    if (token === "b") return "\b";
    if (token === "f") return "\f";
    if (token === "v") return "\v";
    if (token === "\\") return "\\";

    if (token.startsWith("x")) {
      return String.fromCharCode(Number.parseInt(token.slice(1), 16));
    }

    return token;
  });
}

export function buildInsert(block: CopyBlock, rows: string[][]): string | null {
  if (rows.length === 0) return null;

  const columnList = block.columns.map((column) => `"${column}"`).join(", ");

  const values = rows
    .map((row) => {
      const cells = row.map((cell) => {
        if (cell === "\\N") return "NULL";
        return `'${unescapeCopy(cell).replace(/'/g, "''")}'`;
      });

      return `(${cells.join(", ")})`;
    })
    .join(",\n");

  return `INSERT INTO "public"."${block.table}" (${columnList}) OVERRIDING SYSTEM VALUE VALUES\n${values};`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    parts.push(items.slice(index, index + size));
  }

  return parts;
}
