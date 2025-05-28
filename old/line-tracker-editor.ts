// path: line-tracker-editor.ts

import * as fs from "fs";
import * as path from "path";

interface EditOperation {
  startIndex: number;
  endIndex: number;
  newContent: string[];
  description: string;
}

interface LineMapping {
  originalIndex: number;
  currentIndex: number;
  isValid: boolean;
}

interface FileState {
  content: string;
  lines: string[];
  lineMap: Map<number, LineMapping>;
  pendingEdits: EditOperation[];
}

class LineTrackingEditor {
  private fileStates: Map<string, FileState> = new Map();
  private debug: boolean;

  constructor(debug = false) {
    this.debug = debug;
  }

  /**
   * Load a file for editing and create initial line mappings
   */
  loadFile(filePath: string): string[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Create initial line mappings
    const lineMap = new Map<number, LineMapping>();
    lines.forEach((_, index) => {
      lineMap.set(index, {
        originalIndex: index,
        currentIndex: index,
        isValid: true,
      });
    });

    this.fileStates.set(filePath, {
      content,
      lines,
      lineMap,
      pendingEdits: [],
    });

    if (this.debug) {
      console.log(`📁 Loaded ${filePath} with ${lines.length} lines`);
    }

    return lines.map((line, index) => `${index}: ${line}`);
  }

  /**
   * Add an edit operation to the queue
   */
  queueEdit(filePath: string, edit: EditOperation): void {
    const state = this.fileStates.get(filePath);
    if (!state) {
      throw new Error(`File ${filePath} not loaded`);
    }

    // For full file replacement (startIndex: 0, endIndex: -1)
    if (edit.startIndex === 0 && edit.endIndex === -1) {
      edit.endIndex = state.lines.length - 1;
    }

    // Validate edit ranges
    if (edit.startIndex < 0 || edit.endIndex >= state.lines.length) {
      if (this.debug) {
        console.log(
          `⚠️  Edit range ${edit.startIndex}-${edit.endIndex} adjusted for file with ${state.lines.length} lines`
        );
      }
      // Clamp to valid range
      edit.startIndex = Math.max(0, edit.startIndex);
      edit.endIndex = Math.min(state.lines.length - 1, edit.endIndex);
    }

    if (edit.startIndex > edit.endIndex) {
      throw new Error(
        `Invalid edit range: start ${edit.startIndex} > end ${edit.endIndex}`
      );
    }

    state.pendingEdits.push(edit);

    if (this.debug) {
      console.log(
        `📝 Queued edit for ${filePath}: ${edit.description} (lines ${edit.startIndex}-${edit.endIndex})`
      );
    }
  }

  /**
   * Apply all pending edits for a file
   */
  applyEdits(filePath: string): {
    success: boolean;
    changes: string[];
    invalidatedLines: number[];
  } {
    const state = this.fileStates.get(filePath);
    if (!state) {
      throw new Error(`File ${filePath} not loaded`);
    }

    if (state.pendingEdits.length === 0) {
      return { success: true, changes: [], invalidatedLines: [] };
    }

    // Check for conflicts first
    const validation = this.validateEdits(filePath, state.pendingEdits);
    if (!validation.valid) {
      if (this.debug) {
        console.log(`❌ Edit conflicts detected:`, validation.conflicts);
      }
      return {
        success: false,
        changes: [`Edit conflicts: ${validation.conflicts.join(", ")}`],
        invalidatedLines: [],
      };
    }

    // Sort edits in reverse order (highest line numbers first)
    // This prevents line number invalidation during application
    const sortedEdits = [...state.pendingEdits].sort(
      (a, b) => b.startIndex - a.startIndex
    );

    const changes: string[] = [];
    const invalidatedLines: number[] = [];
    let currentLines = [...state.lines];

    if (this.debug) {
      console.log(`🔧 Applying ${sortedEdits.length} edits to ${filePath}`);
    }

    for (const edit of sortedEdits) {
      try {
        const result = this.applySingleEdit(currentLines, edit);
        currentLines = result.newLines;
        changes.push(result.changeDescription);
        invalidatedLines.push(...result.affectedLines);

        if (this.debug) {
          console.log(`  ✅ ${result.changeDescription}`);
        }
      } catch (error) {
        if (this.debug) {
          console.error(`  ❌ Failed to apply edit: ${error.message}`);
        }
        return {
          success: false,
          changes,
          invalidatedLines: [],
        };
      }
    }

    // Update file state
    state.lines = currentLines;
    state.content = currentLines.join("\n");
    state.pendingEdits = [];

    // Rebuild line mappings
    this.rebuildLineMap(state);

    // Write to file
    fs.writeFileSync(filePath, state.content);

    if (this.debug) {
      console.log(`💾 Wrote ${currentLines.length} lines to ${filePath}`);
    }

    return {
      success: true,
      changes,
      invalidatedLines,
    };
  }

  /**
   * Apply a single edit operation
   */
  private applySingleEdit(
    lines: string[],
    edit: EditOperation
  ): {
    newLines: string[];
    changeDescription: string;
    affectedLines: number[];
  } {
    // Validate positions
    if (edit.startIndex < 0 || edit.startIndex >= lines.length) {
      throw new Error(
        `Start index ${edit.startIndex} is out of bounds (0-${
          lines.length - 1
        })`
      );
    }

    if (edit.endIndex < 0 || edit.endIndex >= lines.length) {
      throw new Error(
        `End index ${edit.endIndex} is out of bounds (0-${lines.length - 1})`
      );
    }

    if (edit.startIndex > edit.endIndex) {
      throw new Error(
        `Start index ${edit.startIndex} cannot be greater than end index ${edit.endIndex}`
      );
    }

    // Apply the edit
    const newLines = [
      ...lines.slice(0, edit.startIndex),
      ...edit.newContent,
      ...lines.slice(edit.endIndex + 1),
    ];

    // Calculate affected line range
    const linesDiff =
      edit.newContent.length - (edit.endIndex - edit.startIndex + 1);
    const affectedLines: number[] = [];

    // Mark lines that were directly edited
    for (let i = edit.startIndex; i <= edit.endIndex; i++) {
      affectedLines.push(i);
    }

    // Mark lines that were shifted due to insertion/deletion
    if (linesDiff !== 0) {
      for (let i = edit.endIndex + 1; i < lines.length; i++) {
        affectedLines.push(i);
      }
    }

    const changeDescription = `Replaced lines ${edit.startIndex}-${edit.endIndex} with ${edit.newContent.length} lines: ${edit.description}`;

    if (this.debug) {
      console.log(
        `    Original lines: ${lines.length}, New lines: ${newLines.length}, Diff: ${linesDiff}`
      );
    }

    return {
      newLines,
      changeDescription,
      affectedLines,
    };
  }

  /**
   * Rebuild line mapping after edits
   */
  private rebuildLineMap(state: FileState): void {
    const newLineMap = new Map<number, LineMapping>();

    state.lines.forEach((_, currentIndex) => {
      newLineMap.set(currentIndex, {
        originalIndex: currentIndex,
        currentIndex: currentIndex,
        isValid: true,
      });
    });

    state.lineMap = newLineMap;
  }

  /**
   * Get the current state of a file with line numbers
   */
  getIndexedContent(filePath: string): string[] {
    const state = this.fileStates.get(filePath);
    if (!state) {
      throw new Error(`File ${filePath} not loaded`);
    }

    return state.lines.map((line, index) => `${index}: ${line}`);
  }

  /**
   * Check if edits would conflict
   */
  validateEdits(
    filePath: string,
    edits: EditOperation[]
  ): {
    valid: boolean;
    conflicts: string[];
  } {
    const conflicts: string[] = [];

    // Sort by start index
    const sortedEdits = [...edits].sort((a, b) => a.startIndex - b.startIndex);

    // Check for overlapping ranges
    for (let i = 0; i < sortedEdits.length - 1; i++) {
      const current = sortedEdits[i];
      const next = sortedEdits[i + 1];

      if (current.endIndex >= next.startIndex) {
        conflicts.push(
          `Edit conflict: lines ${current.startIndex}-${current.endIndex} overlaps with ${next.startIndex}-${next.endIndex}`
        );
      }
    }

    return {
      valid: conflicts.length === 0,
      conflicts,
    };
  }

  /**
   * Preview what edits would do without applying them
   */
  previewEdits(
    filePath: string,
    edits: EditOperation[]
  ): {
    preview: string[];
    conflicts: string[];
  } {
    const state = this.fileStates.get(filePath);
    if (!state) {
      throw new Error(`File ${filePath} not loaded`);
    }

    const validation = this.validateEdits(filePath, edits);
    if (!validation.valid) {
      return {
        preview: [],
        conflicts: validation.conflicts,
      };
    }

    // Apply edits to a copy
    const sortedEdits = [...edits].sort((a, b) => b.startIndex - a.startIndex);
    let previewLines = [...state.lines];

    for (const edit of sortedEdits) {
      try {
        const result = this.applySingleEdit(previewLines, edit);
        previewLines = result.newLines;
      } catch (error) {
        return {
          preview: [],
          conflicts: [`Preview error: ${error.message}`],
        };
      }
    }

    return {
      preview: previewLines.map((line, index) => `${index}: ${line}`),
      conflicts: [],
    };
  }

  /**
   * Get statistics about pending edits
   */
  getEditStats(filePath: string): {
    pendingEdits: number;
    totalLinesAffected: number;
    hasConflicts: boolean;
  } {
    const state = this.fileStates.get(filePath);
    if (!state) {
      return {
        pendingEdits: 0,
        totalLinesAffected: 0,
        hasConflicts: false,
      };
    }

    const validation = this.validateEdits(filePath, state.pendingEdits);
    const totalLinesAffected = state.pendingEdits.reduce(
      (sum, edit) => sum + (edit.endIndex - edit.startIndex + 1),
      0
    );

    return {
      pendingEdits: state.pendingEdits.length,
      totalLinesAffected,
      hasConflicts: !validation.valid,
    };
  }

  /**
   * Clear all pending edits for a file
   */
  clearPendingEdits(filePath: string): void {
    const state = this.fileStates.get(filePath);
    if (state) {
      state.pendingEdits = [];
      if (this.debug) {
        console.log(`🗑️ Cleared pending edits for ${filePath}`);
      }
    }
  }

  /**
   * Unload a file from memory
   */
  unloadFile(filePath: string): void {
    this.fileStates.delete(filePath);
    if (this.debug) {
      console.log(`🗑️ Unloaded ${filePath}`);
    }
  }

  /**
   * Replace entire file content - safer method for full replacements
   */
  replaceFileContent(
    filePath: string,
    newContent: string,
    description: string = "Replace entire file"
  ): {
    success: boolean;
    changes: string[];
  } {
    try {
      if (this.debug) {
        console.log(`📝 Replacing entire content of ${filePath}`);
      }

      // Write directly to file
      fs.writeFileSync(filePath, newContent);

      // Update state if file is loaded
      const state = this.fileStates.get(filePath);
      if (state) {
        state.content = newContent;
        state.lines = newContent.split("\n");
        state.pendingEdits = [];
        this.rebuildLineMap(state);
      }

      return {
        success: true,
        changes: [description],
      };
    } catch (error) {
      return {
        success: false,
        changes: [`Failed to replace file content: ${error.message}`],
      };
    }
  }
}

export { LineTrackingEditor, EditOperation };
