// path: smart-file-editor.ts

import * as fs from "fs";
import * as path from "path";
import colors from "../colors";

interface JsonMergeOperation {
  path: string; // JSON path like "compilerOptions.incremental"
  value: any;
  operation: "set" | "merge" | "delete" | "append";
}

interface SmartEditOperation {
  type: "json-merge" | "line-replace" | "full-replace";
  jsonOperations?: JsonMergeOperation[];
  content?: string;
  lineEdits?: Array<{
    startIndex: number;
    endIndex: number;
    newContent: string[];
    description: string;
  }>;
}

export class SmartFileEditor {
  private debug: boolean;

  constructor(debug = false) {
    this.debug = debug;
  }

  async editFile(
    filePath: string,
    operation: SmartEditOperation,
    description: string
  ): Promise<{
    success: boolean;
    changes: string[];
    errors: string[];
  }> {
    const errors: string[] = [];
    const changes: string[] = [];

    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File ${filePath} does not exist`);
      }

      const ext = path.extname(filePath);

      if (this.debug) {
        console.log(
          colors.cyan(`🔧 [DEBUG] Smart editing ${filePath} (${ext})`)
        );
        console.log(colors.gray(`  Operation type: ${operation.type}`));
      }

      switch (operation.type) {
        case "json-merge":
          if (ext !== ".json") {
            throw new Error(
              `JSON merge operation requires .json file, got ${ext}`
            );
          }
          const jsonResult = await this.editJsonFile(
            filePath,
            operation.jsonOperations!,
            description
          );
          return jsonResult;

        case "full-replace":
          if (!operation.content) {
            throw new Error("Full replace operation requires content");
          }
          fs.writeFileSync(filePath, operation.content);
          changes.push(`📝 Replaced entire file: ${description}`);
          break;

        case "line-replace":
          if (!operation.lineEdits) {
            throw new Error("Line replace operation requires lineEdits");
          }
          const lineResult = await this.editLinesInFile(
            filePath,
            operation.lineEdits,
            description
          );
          return lineResult;

        default:
          throw new Error(`Unknown operation type: ${operation.type}`);
      }

      return { success: true, changes, errors };
    } catch (error) {
      if (this.debug) {
        console.log(
          colors.red(`🔧 [DEBUG] Smart edit failed: ${error.message}`)
        );
      }
      return {
        success: false,
        changes,
        errors: [error.message],
      };
    }
  }

  private async editJsonFile(
    filePath: string,
    operations: JsonMergeOperation[],
    description: string
  ): Promise<{
    success: boolean;
    changes: string[];
    errors: string[];
  }> {
    const changes: string[] = [];
    const errors: string[] = [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      let jsonData: any;

      // Parse existing JSON
      try {
        jsonData = JSON.parse(content);
      } catch (parseError) {
        throw new Error(`Invalid JSON in ${filePath}: ${parseError.message}`);
      }

      if (this.debug) {
        console.log(
          colors.gray(
            `  Original JSON keys: ${Object.keys(jsonData).join(", ")}`
          )
        );
      }

      // Apply operations
      for (const op of operations) {
        try {
          const result = this.applyJsonOperation(jsonData, op);
          changes.push(result);
        } catch (opError) {
          errors.push(`Operation failed for ${op.path}: ${opError.message}`);
        }
      }

      // Write back to file with proper formatting
      const newContent = JSON.stringify(jsonData, null, 2);
      fs.writeFileSync(filePath, newContent);

      changes.push(`📝 Updated JSON file: ${description}`);

      if (this.debug) {
        console.log(
          colors.gray(`  New JSON keys: ${Object.keys(jsonData).join(", ")}`)
        );
      }

      return { success: errors.length === 0, changes, errors };
    } catch (error) {
      return {
        success: false,
        changes,
        errors: [error.message],
      };
    }
  }

  private applyJsonOperation(
    jsonData: any,
    operation: JsonMergeOperation
  ): string {
    const pathParts = operation.path.split(".");
    let current = jsonData;

    // Navigate to parent object
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    const finalKey = pathParts[pathParts.length - 1];

    switch (operation.operation) {
      case "set":
        const oldValue = current[finalKey];
        current[finalKey] = operation.value;
        return `Set ${operation.path}: ${JSON.stringify(
          oldValue
        )} → ${JSON.stringify(operation.value)}`;

      case "merge":
        if (
          typeof current[finalKey] !== "object" ||
          Array.isArray(current[finalKey])
        ) {
          current[finalKey] = {};
        }
        Object.assign(current[finalKey], operation.value);
        return `Merged into ${operation.path}: ${JSON.stringify(
          operation.value
        )}`;

      case "delete":
        if (finalKey in current) {
          delete current[finalKey];
          return `Deleted ${operation.path}`;
        }
        return `${operation.path} not found (no deletion needed)`;

      case "append":
        if (!Array.isArray(current[finalKey])) {
          current[finalKey] = [];
        }
        if (Array.isArray(operation.value)) {
          current[finalKey].push(...operation.value);
        } else {
          current[finalKey].push(operation.value);
        }
        return `Appended to ${operation.path}: ${JSON.stringify(
          operation.value
        )}`;

      default:
        throw new Error(`Unknown JSON operation: ${operation.operation}`);
    }
  }

  private async editLinesInFile(
    filePath: string,
    lineEdits: Array<{
      startIndex: number;
      endIndex: number;
      newContent: string[];
      description: string;
    }>,
    description: string
  ): Promise<{
    success: boolean;
    changes: string[];
    errors: string[];
  }> {
    const changes: string[] = [];
    const errors: string[] = [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      let lines = content.split("\n");

      // Sort edits in reverse order to avoid index shifting
      const sortedEdits = [...lineEdits].sort(
        (a, b) => b.startIndex - a.startIndex
      );

      for (const edit of sortedEdits) {
        // Validate indices
        const startIndex = Math.max(0, edit.startIndex);
        const endIndex =
          edit.endIndex === -1
            ? lines.length - 1
            : Math.min(lines.length - 1, edit.endIndex);

        if (startIndex <= endIndex) {
          const newLines = [
            ...lines.slice(0, startIndex),
            ...edit.newContent,
            ...lines.slice(endIndex + 1),
          ];
          lines = newLines;
          changes.push(
            `Modified lines ${startIndex}-${endIndex}: ${edit.description}`
          );
        }
      }

      fs.writeFileSync(filePath, lines.join("\n"));
      changes.push(`📝 Updated file: ${description}`);

      return { success: true, changes, errors };
    } catch (error) {
      return {
        success: false,
        changes,
        errors: [error.message],
      };
    }
  }

  // Convenience methods for common operations
  updateTsConfig(
    filePath: string,
    compilerOptions: any,
    otherOptions: any = {}
  ): Promise<{
    success: boolean;
    changes: string[];
    errors: string[];
  }> {
    const operations: JsonMergeOperation[] = [];

    if (compilerOptions) {
      operations.push({
        path: "compilerOptions",
        value: compilerOptions,
        operation: "merge",
      });
    }

    for (const [key, value] of Object.entries(otherOptions)) {
      operations.push({
        path: key,
        value: value,
        operation: "set",
      });
    }

    return this.editFile(
      filePath,
      {
        type: "json-merge",
        jsonOperations: operations,
      },
      "Update TypeScript configuration"
    );
  }

  updatePackageJson(
    filePath: string,
    updates: {
      scripts?: any;
      dependencies?: any;
      devDependencies?: any;
      [key: string]: any;
    }
  ): Promise<{
    success: boolean;
    changes: string[];
    errors: string[];
  }> {
    const operations: JsonMergeOperation[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (
        key === "scripts" ||
        key === "dependencies" ||
        key === "devDependencies"
      ) {
        operations.push({
          path: key,
          value: value,
          operation: "merge",
        });
      } else {
        operations.push({
          path: key,
          value: value,
          operation: "set",
        });
      }
    }

    return this.editFile(
      filePath,
      {
        type: "json-merge",
        jsonOperations: operations,
      },
      "Update package.json"
    );
  }

  // Check if file needs intelligent editing
  shouldUseSmartEdit(filePath: string, editType: string): boolean {
    const ext = path.extname(filePath);

    if (ext === ".json") {
      return editType === "merge" || editType === "update";
    }

    // Add more intelligent editing conditions here
    return false;
  }

  // Create edit operation from AI description
  static createJsonMergeFromDescription(
    description: string,
    targetPath: string,
    value: any
  ): SmartEditOperation {
    return {
      type: "json-merge",
      jsonOperations: [
        {
          path: targetPath,
          value: value,
          operation: "merge",
        },
      ],
    };
  }
}
