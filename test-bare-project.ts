// path: test-bare-project.ts

import { EnhancedSequentialAIAgent } from "./enhanced-ai-agent";
import * as fs from "fs";
import * as path from "path";
import colors from "./colors";

async function testBareProjectScenarios() {
	console.log(
		colors.blue("🧪 Testing Enhanced AI Agent with Bare Project Scenarios")
	);
	console.log("=".repeat(60));

	// Create a temporary test directory
	const testDir = path.join(__dirname, "test-bare-project");

	// Clean up any existing test directory
	if (fs.existsSync(testDir)) {
		fs.rmSync(testDir, { recursive: true, force: true });
	}

	// Create empty test directory
	fs.mkdirSync(testDir, { recursive: true });

	console.log(`📁 Created test directory: ${testDir}`);

	try {
		// Test 1: HTML file creation in bare project
		console.log(
			"\n" + colors.cyan("Test 1: HTML file creation in bare project")
		);
		console.log("-".repeat(40));

		const agent = new EnhancedSequentialAIAgent(testDir, { debug: false });

		const result = await agent.processUserRequest(
			"create a simple HTML login form"
		);

		console.log(
			`✅ Test 1 Result: ${result.success ? "SUCCESS" : "FAILED"}`
		);
		if (result.success) {
			console.log(`📊 ${result.summary}`);
			console.log("📁 Files created:");
			fs.readdirSync(testDir).forEach((file) => {
				console.log(`   📄 ${file}`);
			});
		} else {
			console.log(`❌ Error: ${result.summary}`);
		}

		// Test 2: CSS file creation in bare project
		console.log(
			"\n" + colors.cyan("Test 2: CSS file creation alongside HTML")
		);
		console.log("-".repeat(40));

		const result2 = await agent.processUserRequest(
			"create a stylesheet for the login form"
		);

		console.log(
			`✅ Test 2 Result: ${result2.success ? "SUCCESS" : "FAILED"}`
		);
		if (result2.success) {
			console.log(`📊 ${result2.summary}`);
			console.log("📁 Updated file list:");
			fs.readdirSync(testDir).forEach((file) => {
				console.log(`   📄 ${file}`);
			});
		}

		// Test 3: JavaScript file creation
		console.log("\n" + colors.cyan("Test 3: JavaScript file creation"));
		console.log("-".repeat(40));

		const result3 = await agent.processUserRequest(
			"create a simple JavaScript file for form validation"
		);

		console.log(
			`✅ Test 3 Result: ${result3.success ? "SUCCESS" : "FAILED"}`
		);
		if (result3.success) {
			console.log(`📊 ${result3.summary}`);
			console.log("📁 Final file list:");
			fs.readdirSync(testDir).forEach((file) => {
				console.log(`   📄 ${file}`);
			});
		}
	} catch (error) {
		console.log(colors.red(`❌ Test failed with error: ${error.message}`));
	} finally {
		// Clean up test directory
		console.log(`\n🧹 Cleaning up test directory...`);
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
		console.log("✅ Cleanup completed");
	}
}

// Simplified test without actual AI calls
async function testLogicOnly() {
	console.log(colors.blue("\n🧪 Testing Logic Only (No AI Calls)"));
	console.log("=".repeat(60));

	const testDir = path.join(__dirname, "test-logic");

	// Clean up and create test directory
	if (fs.existsSync(testDir)) {
		fs.rmSync(testDir, { recursive: true, force: true });
	}
	fs.mkdirSync(testDir, { recursive: true });

	try {
		const agent = new EnhancedSequentialAIAgent(testDir, { debug: true });

		// Test the helper methods directly
		console.log("\n" + colors.cyan("Testing helper methods:"));

		// Test findProjectEntryPoints with bare project
		const entryPoints = (agent as any).findProjectEntryPoints();
		console.log(`📍 Entry points found: ${entryPoints.length}`);
		entryPoints.forEach((ep) => console.log(`   - ${ep}`));

		// Test isStandaloneFileCreation
		const mockExecutionPlan = {
			likelyFilesToCreate: ["login.html"],
			likelyFilesToModify: [],
			contextFilesNeeded: [],
		};

		const isStandalone = (agent as any).isStandaloneFileCreation(
			mockExecutionPlan
		);
		console.log(`🎯 Is standalone file creation: ${isStandalone}`);

		// Test with TypeScript files
		const mockTsExecutionPlan = {
			likelyFilesToCreate: ["user.service.ts"],
			likelyFilesToModify: [],
			contextFilesNeeded: ["base.service.ts"],
		};

		const isTsStandalone = (agent as any).isStandaloneFileCreation(
			mockTsExecutionPlan
		);
		console.log(`🎯 Is TS standalone (should be false): ${isTsStandalone}`);

		console.log(colors.green("\n✅ Logic tests completed successfully"));
	} catch (error) {
		console.log(colors.red(`❌ Logic test failed: ${error.message}`));
	} finally {
		// Clean up
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	}
}

// Usage examples
async function showUsageExamples() {
	console.log(colors.blue("\n📖 Usage Examples for Bare Projects"));
	console.log("=".repeat(60));

	console.log(
		colors.green("✅ These requests will now work in bare projects:")
	);
	console.log('   • "create a simple HTML login form"');
	console.log('   • "create a CSS stylesheet for styling"');
	console.log('   • "create a JavaScript file for form validation"');
	console.log('   • "create a JSON configuration file"');
	console.log('   • "create a README.md file"');

	console.log(
		colors.yellow(
			"\n⚠️  These requests will analyze existing project structure:"
		)
	);
	console.log('   • "add authentication to the user service"');
	console.log('   • "create a new component for the React app"');
	console.log('   • "refactor the large controller into smaller modules"');

	console.log(colors.cyan("\n🎯 The agent automatically detects:"));
	console.log("   • Standalone file creation (HTML, CSS, JS, etc.)");
	console.log("   • Bare projects (no existing code structure)");
	console.log("   • Existing projects (with TypeScript/JavaScript files)");
	console.log("   • Context requirements (when to analyze dependencies)");
}

// Main execution
async function main() {
	console.log(
		colors.bold("🚀 Enhanced AI Agent - Bare Project Testing Suite")
	);
	console.log("=".repeat(60));

	await showUsageExamples();
	await testLogicOnly();

	// Only run full AI tests if API key is available
	if (process.env.ANTHROPIC_API_KEY) {
		console.log(colors.green("\n🔑 API key found - running full AI tests"));
		await testBareProjectScenarios();
	} else {
		console.log(
			colors.yellow("\n⚠️  No API key found - skipping AI tests")
		);
		console.log("   Set ANTHROPIC_API_KEY to run full tests");
	}

	console.log(colors.green("\n🎉 All tests completed!"));
}

if (require.main === module) {
	main().catch(console.error);
}

export { testBareProjectScenarios, testLogicOnly };
