// path: xml-prompt-templates.ts

/**
 * Comprehensive XML-based prompt templates for the AI coding agent
 * All prompts follow XML standards with semantic clarity and proper structure
 */

export class XMLPromptTemplates {
	/**
	 * PROMPT CATEGORY: REQUEST ANALYSIS
	 * Purpose: Analyze user requests to determine required actions
	 */

	static REQUEST_ANALYSIS = `
  <!-- Template for analyzing user requests and determining actions needed -->
  <system_context>
    <!-- Current project state and constraints -->
    <project_root>{{projectRoot}}</project_root>
    <existing_files>{{existingFiles}}</existing_files>
    <current_errors>{{currentErrors}}</current_errors>
    <project_type>{{projectType}}</project_type>
  </system_context>
  
  <user_request>
    <!-- The actual user request to be analyzed -->
    {{userRequest}}
  </user_request>
  
  <analysis_requirements>
    <!-- Guidelines for the analysis process -->
    <objective>Determine what file operations, shell commands, or other actions are needed to fulfill the user request</objective>
    <considerations>
      <item>Current project structure and existing files</item>
      <item>Dependencies between files that may be affected</item>
      <item>Best practices for the detected project type</item>
      <item>Potential risks or conflicts</item>
      <item>Order of operations for optimal execution</item>
    </considerations>
  </analysis_requirements>
  
  <instructions>
  Analyze the user request in context of the current project state. Determine what specific actions are needed.
  Consider file dependencies, project conventions, and execution order.
  Provide a comprehensive analysis and actionable plan.
  </instructions>`;

	/**
	 * PROMPT CATEGORY: FILE CREATION
	 * Purpose: Generate complete content for new files
	 */

	static FILE_CREATION = `
  <!-- Template for generating content for new files -->
  <file_context>
    <!-- Metadata about the file to be created -->
    <filename>{{fileName}}</filename>
    <file_type>{{fileType}}</file_type>
    <file_extension>{{fileExtension}}</file_extension>
    <target_directory>{{targetDirectory}}</target_directory>
  </file_context>
  
  <creation_requirements>
    <!-- What the file should accomplish -->
    <purpose>{{filePurpose}}</purpose>
    <functionality>{{requiredFunctionality}}</functionality>
    <dependencies>{{fileDependencies}}</dependencies>
    <integration_points>{{integrationPoints}}</integration_points>
  </creation_requirements>
  
  <project_context>
    <!-- Current project information for consistency -->
    <project_structure>{{projectStructure}}</project_structure>
    <existing_patterns>{{existingPatterns}}</existing_patterns>
    <coding_standards>{{codingStandards}}</coding_standards>
    <framework_conventions>{{frameworkConventions}}</framework_conventions>
  </project_context>
  
  <quality_standards>
    <!-- Requirements for code quality -->
    <requirements>
      <item>Follow project's existing code style and patterns</item>
      <item>Include comprehensive error handling</item>
      <item>Add appropriate TypeScript types and interfaces</item>
      <item>Include JSDoc comments for public APIs</item>
      <item>Follow SOLID principles and best practices</item>
      <item>Ensure code is testable and maintainable</item>
    </requirements>
  </quality_standards>
  
  <instructions>
  Create complete, production-ready content for the specified file.
  Ensure it integrates seamlessly with the existing project structure.
  Follow all quality standards and project conventions.
  Include all necessary imports, exports, types, and documentation.
  </instructions>`;

	/**
	 * PROMPT CATEGORY: FILE MODIFICATION
	 * Purpose: Modify existing files while preserving functionality
	 */

	static FILE_MODIFICATION = `
  <!-- Template for modifying existing files -->
  <file_context>
    <!-- Current file information -->
    <filename>{{fileName}}</filename>
    <file_type>{{fileType}}</file_type>
    <current_content>{{currentContent}}</current_content>
    <file_size>{{fileSize}}</file_size>
  </file_context>
  
  <modification_request>
    <!-- What changes are requested -->
    <description>{{modificationDescription}}</description>
    <specific_changes>{{specificChanges}}</specific_changes>
    <preserve_functionality>{{preserveFunctionality}}</preserve_functionality>
    <affected_sections>{{affectedSections}}</affected_sections>
  </modification_request>
  
  <context_awareness>
    <!-- Understanding of current code structure -->
    <existing_functions>{{existingFunctions}}</existing_functions>
    <current_imports>{{currentImports}}</current_imports>
    <existing_types>{{existingTypes}}</existing_types>
    <dependencies>{{fileDependencies}}</dependencies>
  </context_awareness>
  
  <modification_constraints>
    <!-- Rules for safe modification -->
    <constraints>
      <item>Preserve all existing functionality unless explicitly asked to change it</item>
      <item>Maintain backward compatibility for public APIs</item>
      <item>Keep existing imports unless they become unused</item>
      <item>Preserve code formatting and style consistency</item>
      <item>Update related comments and documentation</item>
      <item>Ensure TypeScript types remain accurate</item>
    </constraints>
  </modification_constraints>
  
  <instructions>
  Modify the file content according to the specified requirements.
  Preserve all existing functionality that should remain unchanged.
  Ensure the modified code is complete, functional, and maintains quality standards.
  Update imports, types, and documentation as needed.
  </instructions>`;

	/**
	 * PROMPT CATEGORY: ERROR ANALYSIS AND FIXING
	 * Purpose: Analyze and fix compilation/syntax errors
	 */

	static ERROR_ANALYSIS_AND_FIX = `
  <!-- Template for analyzing and fixing code errors -->
  <error_context>
    <!-- Information about the errors encountered -->
    <file_with_errors>{{fileName}}</file_with_errors>
    <error_list>{{errorList}}</error_list>
    <error_severity>{{errorSeverity}}</error_severity>
    <affected_lines>{{affectedLines}}</affected_lines>
  </error_context>
  
  <current_code>
    <!-- The code that has errors -->
    <content>{{currentContent}}</content>
    <line_numbers>{{withLineNumbers}}</line_numbers>
  </current_code>
  
  <project_context>
    <!-- Project information for context -->
    <project_type>{{projectType}}</project_type>
    <typescript_config>{{typescriptConfig}}</typescript_config>
    <available_dependencies>{{availableDependencies}}</available_dependencies>
    <project_structure>{{projectStructure}}</project_structure>
  </project_context>
  
  <fix_requirements>
    <!-- Guidelines for fixing errors -->
    <objectives>
      <item>Fix all compilation and syntax errors</item>
      <item>Preserve existing functionality and logic</item>
      <item>Maintain code readability and structure</item>
      <item>Follow TypeScript best practices</item>
      <item>Ensure all imports and dependencies are correct</item>
    </objectives>
    <constraints>
      <item>Do not remove or significantly alter working functionality</item>
      <item>Add missing imports rather than removing usage</item>
      <item>Provide proper TypeScript types for all variables</item>
      <item>Maintain existing code organization and structure</item>
    </constraints>
  </fix_requirements>
  
  <instructions>
  Analyze each error carefully and provide a corrected version of the file.
  Fix all syntax errors, type errors, and import issues.
  Ensure the corrected code compiles successfully and maintains all intended functionality.
  Provide explanations for complex fixes in comments where appropriate.
  </instructions>`;

	/**
	 * PROMPT CATEGORY: SHELL COMMAND GENERATION
	 * Purpose: Generate safe shell commands for specific tasks
	 */

	static SHELL_COMMAND_GENERATION = `
  <!-- Template for generating shell commands -->
  <command_context>
    <!-- Information about the requested command -->
    <task_description>{{taskDescription}}</task_description>
    <operating_system>{{operatingSystem}}</operating_system>
    <working_directory>{{workingDirectory}}</working_directory>
    <available_tools>{{availableTools}}</available_tools>
  </command_context>
  
  <project_environment>
    <!-- Current project environment -->
    <project_type>{{projectType}}</project_type>
    <package_manager>{{packageManager}}</package_manager>
    <available_scripts>{{availableScripts}}</available_scripts>
    <dependencies>{{projectDependencies}}</dependencies>
  </project_environment>
  
  <safety_requirements>
    <!-- Safety constraints for command generation -->
    <allowed_operations>
      <item>Package installation and management</item>
      <item>Build and compilation commands</item>
      <item>Test execution</item>
      <item>Development server operations</item>
      <item>Git operations (non-destructive)</item>
      <item>File and directory operations (within project)</item>
    </allowed_operations>
    <forbidden_operations>
      <item>System-wide changes or installations</item>
      <item>Operations outside the project directory</item>
      <item>Destructive operations without explicit confirmation</item>
      <item>Network operations to unknown endpoints</item>
      <item>Operations requiring elevated privileges</item>
    </forbidden_operations>
  </safety_requirements>
  
  <instructions>
  Generate safe, appropriate shell commands to accomplish the requested task.
  Ensure commands are compatible with the detected environment and package manager.
  Provide commands that are safe to execute within the project context.
  Include error handling or conditional execution where appropriate.
  </instructions>`;

	/**
	 * PROMPT CATEGORY: PROJECT STRUCTURE ANALYSIS
	 * Purpose: Analyze and understand project structure
	 */

	static PROJECT_STRUCTURE_ANALYSIS = `
  <!-- Template for analyzing project structure -->
  <project_data>
    <!-- Raw project information -->
    <file_tree>{{fileTree}}</file_tree>
    <package_json>{{packageJson}}</package_json>
    <config_files>{{configFiles}}</config_files>
    <source_directories>{{sourceDirectories}}</source_directories>
  </project_data>
  
  <analysis_scope>
    <!-- What to analyze in the project -->
    <focus_areas>
      <item>Project type and framework identification</item>
      <item>Architecture patterns and conventions</item>
      <item>Dependency relationships and structure</item>
      <item>Build and deployment configuration</item>
      <item>Development workflow and tooling</item>
    </focus_areas>
  </analysis_scope>
  
  <identification_criteria>
    <!-- Criteria for identifying project characteristics -->
    <framework_indicators>
      <react>presence of react dependencies, JSX files, components directory</react>
      <vue>vue dependencies, .vue files, vue.config.js</vue>
      <angular>angular dependencies, angular.json, app.module.ts</angular>
      <nextjs>next.js dependencies, pages directory, next.config.js</nextjs>
      <nestjs>nest dependencies, decorators, app.module.ts</nestjs>
      <express>express dependencies, server/app files, middleware</express>
    </framework_indicators>
  </identification_criteria>
  
  <instructions>
  Analyze the provided project structure and identify key characteristics.
  Determine the project type, framework, architecture patterns, and conventions.
  Provide insights into the project's organization and development approach.
  Identify any configuration issues or improvement opportunities.
  </instructions>`;

	/**
	 * PROMPT CATEGORY: CODE REVIEW AND QUALITY ASSESSMENT
	 * Purpose: Review code quality and suggest improvements
	 */

	static CODE_REVIEW_AND_QUALITY = `
  <!-- Template for code review and quality assessment -->
  <code_context>
    <!-- Code to be reviewed -->
    <filename>{{fileName}}</filename>
    <file_content>{{fileContent}}</file_content>
    <file_type>{{fileType}}</file_type>
    <review_scope>{{reviewScope}}</review_scope>
  </code_context>
  
  <review_criteria>
    <!-- Standards for code review -->
    <quality_aspects>
      <readability>Code clarity, naming conventions, comments</readability>
      <maintainability>Structure, modularity, separation of concerns</maintainability>
      <performance>Efficiency, optimization opportunities</performance>
      <security>Vulnerability assessment, best practices</security>
      <testing>Testability, test coverage considerations</testing>
      <standards>Adherence to coding standards and conventions</standards>
    </quality_aspects>
  </review_criteria>
  
  <project_context>
    <!-- Project-specific context for review -->
    <project_standards>{{projectStandards}}</project_standards>
    <framework_conventions>{{frameworkConventions}}</framework_conventions>
    <existing_patterns>{{existingPatterns}}</existing_patterns>
    <team_preferences>{{teamPreferences}}</team_preferences>
  </project_context>
  
  <assessment_guidelines>
    <!-- How to conduct the review -->
    <approach>
      <item>Evaluate code against established best practices</item>
      <item>Consider maintainability and readability</item>
      <item>Identify potential bugs or issues</item>
      <item>Suggest specific improvements with examples</item>
      <item>Prioritize suggestions by impact and effort</item>
    </approach>
  </assessment_guidelines>
  
  <instructions>
  Review the provided code thoroughly against the specified criteria.
  Identify strengths, weaknesses, and improvement opportunities.
  Provide specific, actionable suggestions with examples where possible.
  Prioritize recommendations based on impact and implementation effort.
  </instructions>`;

	/**
	 * PROMPT CATEGORY: DEPENDENCY ANALYSIS
	 * Purpose: Analyze file and project dependencies
	 */

	static DEPENDENCY_ANALYSIS = `
  <!-- Template for analyzing dependencies -->
  <dependency_context>
    <!-- Information about dependencies to analyze -->
    <target_files>{{targetFiles}}</target_files>
    <dependency_tree>{{dependencyTree}}</dependency_tree>
    <import_statements>{{importStatements}}</import_statements>
    <export_statements>{{exportStatements}}</export_statements>
  </dependency_context>
  
  <analysis_objectives>
    <!-- What to analyze about dependencies -->
    <goals>
      <item>Map dependency relationships between files</item>
      <item>Identify circular dependencies and issues</item>
      <item>Analyze external package dependencies</item>
      <item>Assess dependency health and update needs</item>
      <item>Identify unused or redundant dependencies</item>
    </goals>
  </analysis_objectives>
  
  <project_metadata>
    <!-- Project context for dependency analysis -->
    <package_json>{{packageJson}}</package_json>
    <lock_files>{{lockFiles}}</lock_files>
    <config_files>{{configFiles}}</config_files>
    <project_structure>{{projectStructure}}</project_structure>
  </project_metadata>
  
  <analysis_criteria>
    <!-- Standards for dependency assessment -->
    <health_indicators>
      <item>Version compatibility and security</item>
      <item>Maintenance status and community support</item>
      <item>Performance impact and bundle size</item>
      <item>License compatibility</item>
      <item>Alternative options and recommendations</item>
    </health_indicators>
  </analysis_criteria>
  
  <instructions>
  Analyze the dependency structure and relationships thoroughly.
  Identify potential issues, circular dependencies, and optimization opportunities.
  Assess the health and appropriateness of external dependencies.
  Provide recommendations for improvements and best practices.
  </instructions>`;

	/**
	 * UTILITY METHODS
	 * Helper methods for working with templates
	 */

	/**
	 * Get template by category and specific use case
	 */
	static getTemplate(category: string, useCase?: string): string {
		const templates = {
			"request-analysis": this.REQUEST_ANALYSIS,
			"file-creation": this.FILE_CREATION,
			"file-modification": this.FILE_MODIFICATION,
			"error-analysis": this.ERROR_ANALYSIS_AND_FIX,
			"shell-command": this.SHELL_COMMAND_GENERATION,
			"project-analysis": this.PROJECT_STRUCTURE_ANALYSIS,
			"code-review": this.CODE_REVIEW_AND_QUALITY,
			"dependency-analysis": this.DEPENDENCY_ANALYSIS,
		};

		const template = templates[category as keyof typeof templates];
		if (!template) {
			throw new Error(`Unknown template category: ${category}`);
		}

		return template;
	}

	/**
	 * Process template with context data
	 */
	static processTemplate(
		template: string,
		context: Record<string, any>
	): string {
		let processed = template;

		// Replace all context placeholders
		Object.entries(context).forEach(([key, value]) => {
			if (value !== undefined && value !== null) {
				const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
				processed = processed.replace(placeholder, String(value));
			}
		});

		// Clean up any remaining empty placeholders
		processed = processed.replace(/\{\{[^}]+\}\}/g, "[Not provided]");

		return processed;
	}

	/**
	 * Validate template structure
	 */
	static validateTemplate(template: string): {
		valid: boolean;
		issues: string[];
	} {
		const issues: string[] = [];

		// Check for XML-like structure
		if (!template.includes("<") || !template.includes(">")) {
			issues.push("Template should contain XML-like structure");
		}

		// Check for required sections
		const requiredSections = ["instructions"];
		requiredSections.forEach((section) => {
			if (!template.includes(section)) {
				issues.push(`Template should contain ${section} section`);
			}
		});

		// Check for placeholder format
		const placeholderRegex = /\{\{[^}]+\}\}/g;
		const placeholders = template.match(placeholderRegex) || [];

		if (placeholders.length === 0) {
			issues.push(
				"Template should contain context placeholders {{variableName}}"
			);
		}

		return {
			valid: issues.length === 0,
			issues,
		};
	}

	/**
	 * Get expected XML response tags for a template
	 */
	static getExpectedResponseTags(templateCategory: string): string[] {
		const tagMapping = {
			"request-analysis": ["analysis", "actions", "priority"],
			"file-creation": ["content", "imports", "exports"],
			"file-modification": ["content", "changes_summary"],
			"error-analysis": ["content", "fixes_applied", "explanation"],
			"shell-command": ["commands", "explanation", "safety_notes"],
			"project-analysis": ["analysis", "recommendations", "project_type"],
			"code-review": ["assessment", "issues", "recommendations"],
			"dependency-analysis": ["analysis", "issues", "recommendations"],
		};

		return (
			tagMapping[templateCategory as keyof typeof tagMapping] || [
				"content",
			]
		);
	}
}
