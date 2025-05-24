// line-tracker-editor.ts

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

		// Validate edit ranges
		if (edit.startIndex < 0 || edit.endIndex >= state.lines.length) {
			throw new Error(
				`Edit range ${edit.startIndex}-${edit.endIndex} is out of bounds`
			);
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

		// Sort edits in reverse order (highest line numbers first)
		// This prevents line number invalidation during application
		const sortedEdits = [...state.pendingEdits].sort(
			(a, b) => b.startIndex - a.startIndex
		);

		const changes: string[] = [];
		const invalidatedLines: number[] = [];
		let currentLines = [...state.lines];

		if (this.debug) {
			console.log(
				`🔧 Applying ${sortedEdits.length} edits to ${filePath}`
			);
		}

		for (const edit of sortedEdits) {
			try {
				const result = this.applySingleEdit(state, currentLines, edit);
				currentLines = result.newLines;
				changes.push(result.changeDescription);
				invalidatedLines.push(...result.affectedLines);

				if (this.debug) {
					console.log(`  ✅ ${result.changeDescription}`);
				}
			} catch (error) {
				if (this.debug) {
					console.error(
						`  ❌ Failed to apply edit: ${error.message}`
					);
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
		state: FileState,
		lines: string[],
		edit: EditOperation
	): {
		newLines: string[];
		changeDescription: string;
		affectedLines: number[];
	} {
		// Get current line positions (might have changed due to previous edits)
		const currentStart = this.getCurrentLineIndex(state, edit.startIndex);
		const currentEnd = this.getCurrentLineIndex(state, edit.endIndex);

		if (currentStart === -1 || currentEnd === -1) {
			throw new Error(
				`Cannot find current position for lines ${edit.startIndex}-${edit.endIndex}`
			);
		}

		// Validate current positions
		if (currentStart < 0 || currentEnd >= lines.length) {
			throw new Error(
				`Current positions ${currentStart}-${currentEnd} are out of bounds`
			);
		}

		// Apply the edit
		const newLines = [
			...lines.slice(0, currentStart),
			...edit.newContent,
			...lines.slice(currentEnd + 1),
		];

		// Calculate affected line range
		const linesDiff =
			edit.newContent.length - (currentEnd - currentStart + 1);
		const affectedLines: number[] = [];

		// Mark lines that were directly edited or shifted
		for (let i = edit.startIndex; i <= edit.endIndex; i++) {
			affectedLines.push(i);
		}

		// Mark lines that were shifted due to insertion/deletion
		if (linesDiff !== 0) {
			for (let i = edit.endIndex + 1; i < state.lines.length; i++) {
				affectedLines.push(i);
			}
		}

		const changeDescription = `Replaced lines ${edit.startIndex}-${edit.endIndex} with ${edit.newContent.length} lines: ${edit.description}`;

		return {
			newLines,
			changeDescription,
			affectedLines,
		};
	}

	/**
	 * Get current line index after previous edits
	 */
	private getCurrentLineIndex(
		state: FileState,
		originalIndex: number
	): number {
		const mapping = state.lineMap.get(originalIndex);
		return mapping && mapping.isValid ? mapping.currentIndex : -1;
	}

	/**
	 * Rebuild line mapping after edits
	 */
	private rebuildLineMap(state: FileState): void {
		const newLineMap = new Map<number, LineMapping>();

		state.lines.forEach((_, currentIndex) => {
			// For now, we'll create a simple mapping
			// In a more sophisticated system, you'd track the lineage of each line
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
		const sortedEdits = [...edits].sort(
			(a, b) => a.startIndex - b.startIndex
		);

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
		const tempState: FileState = {
			content: state.content,
			lines: [...state.lines],
			lineMap: new Map(state.lineMap),
			pendingEdits: [...edits],
		};

		const sortedEdits = [...edits].sort(
			(a, b) => b.startIndex - a.startIndex
		);
		let previewLines = [...state.lines];

		for (const edit of sortedEdits) {
			const result = this.applySingleEdit(tempState, previewLines, edit);
			previewLines = result.newLines;
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
}

// Example usage and test
class EditorDemo {
	static async demonstrateEditing() {
		const editor = new LineTrackingEditor(true);

		// Create a test file
		const testFile = "./test-edit.ts";
		const originalContent = `import { Component } from '@angular/core';

@Component({
  selector: 'app-test',
  template: '<h1>Hello World</h1>'
})
export class TestComponent {
  constructor() {
    console.log('Test component created');
  }
  
  ngOnInit() {
    console.log('Component initialized');
  }
}`;

		fs.writeFileSync(testFile, originalContent);

		try {
			// Load file
			console.log("📁 Loading file...");
			const indexedContent = editor.loadFile(testFile);
			console.log("Initial content:");
			indexedContent.forEach((line) => console.log(line));

			// Queue multiple edits
			console.log("\n📝 Queueing edits...");

			// Edit 1: Add import
			editor.queueEdit(testFile, {
				startIndex: 0,
				endIndex: 0,
				newContent: [
					"import { Component, OnInit } from '@angular/core';",
					"import { Logger } from './logger';",
				],
				description: "Add OnInit import and Logger",
			});

			// Edit 2: Implement OnInit interface
			editor.queueEdit(testFile, {
				startIndex: 6,
				endIndex: 6,
				newContent: ["export class TestComponent implements OnInit {"],
				description: "Implement OnInit interface",
			});

			// Edit 3: Add private logger field
			editor.queueEdit(testFile, {
				startIndex: 7,
				endIndex: 7,
				newContent: [
					"  private logger = new Logger();",
					"",
					"  constructor() {",
				],
				description: "Add logger field",
			});

			// Preview edits
			console.log("\n👀 Previewing edits...");
			const preview = editor.previewEdits(testFile, []);
			preview.preview.forEach((line) => console.log(line));

			// Apply edits
			console.log("\n🔧 Applying edits...");
			const result = editor.applyEdits(testFile);

			if (result.success) {
				console.log("✅ Edits applied successfully!");
				console.log("Changes made:");
				result.changes.forEach((change) =>
					console.log(`  - ${change}`)
				);

				console.log("\nFinal content:");
				const finalContent = editor.getIndexedContent(testFile);
				finalContent.forEach((line) => console.log(line));
			} else {
				console.log("❌ Failed to apply edits");
			}
		} finally {
			// Cleanup
			if (fs.existsSync(testFile)) {
				fs.unlinkSync(testFile);
			}
			editor.unloadFile(testFile);
		}
	}
}

export { LineTrackingEditor, EditOperation };

// Run demo if called directly
if (require.main === module) {
	EditorDemo.demonstrateEditing().catch(console.error);
}
