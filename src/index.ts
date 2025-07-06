// src/index.ts
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ingest } from "@magarcia/gitingest";

interface Env {
	// Environment bindings if needed
}

export class GitIngestMCP extends McpAgent<Env> {
	server = new McpServer({
		name: "GitIngest MCP Server",
		version: "1.0.0",
		description:
			"MCP server providing GitIngest functionality for analyzing GitHub repositories",
	});

	async init() {
		// Main tool for ingesting a GitHub repository
		this.server.tool(
			"ingest_github_repo",
			"Fetches and formats a GitHub repository for LLM consumption. Returns structured content including summary, file tree, and full file contents.",
			{
				repo_url: z
					.string()
					.describe(
						"GitHub repository URL (e.g., https://github.com/user/repo)",
					),
				include_patterns: z
					.array(z.string())
					.optional()
					.describe(
						"Unix shell-style patterns to include (e.g., ['*.py', '*.js'])",
					),
				exclude_patterns: z
					.array(z.string())
					.optional()
					.describe(
						"Unix shell-style patterns to exclude (e.g., ['node_modules/*', '*.log'])",
					),
				max_file_size: z
					.number()
					.optional()
					.describe("Maximum file size in bytes to process"),
			},
			async ({
				repo_url,
				include_patterns,
				exclude_patterns,
				max_file_size,
			}) => {
				try {
					// Call GitIngest with the provided options
					const options: any = {};
					if (include_patterns) options.include_patterns = include_patterns;
					if (exclude_patterns) options.exclude_patterns = exclude_patterns;
					if (max_file_size) options.max_file_size = max_file_size;

					const [summary, tree, content] = await ingest(repo_url, options);

					// Return structured response
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										summary,
										tree,
										content,
										metadata: {
											repo_url,
											timestamp: new Date().toISOString(),
											options_used: options,
										},
									},
									null,
									2,
								),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										error: "Failed to ingest repository",
										message:
											error instanceof Error ? error.message : String(error),
										repo_url,
									},
									null,
									2,
								),
							},
						],
					};
				}
			},
		);

		// Focused tool for getting just the repository structure
		this.server.tool(
			"get_repo_structure",
			"Gets just the directory tree structure of a GitHub repository without file contents",
			{
				repo_url: z.string().describe("GitHub repository URL"),
			},
			async ({ repo_url }) => {
				try {
					const [summary, tree, _] = await ingest(repo_url, {
						max_file_size: 1, // Minimize content retrieval
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										summary,
										tree,
										repo_url,
									},
									null,
									2,
								),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										error: "Failed to get repository structure",
										message:
											error instanceof Error ? error.message : String(error),
										repo_url,
									},
									null,
									2,
								),
							},
						],
					};
				}
			},
		);

		// Tool for analyzing specific file types
		this.server.tool(
			"analyze_code_files",
			"Analyzes specific types of code files in a repository",
			{
				repo_url: z.string().describe("GitHub repository URL"),
				language: z
					.enum([
						"python",
						"javascript",
						"typescript",
						"go",
						"rust",
						"java",
						"csharp",
					])
					.describe("Programming language to analyze"),
			},
			async ({ repo_url, language }) => {
				try {
					const patternMap = {
						python: ["*.py"],
						javascript: ["*.js", "*.mjs"],
						typescript: ["*.ts", "*.tsx"],
						go: ["*.go"],
						rust: ["*.rs"],
						java: ["*.java"],
						csharp: ["*.cs"],
					};

					const [summary, tree, content] = await ingest(repo_url, {
						include_patterns: patternMap[language],
						exclude_patterns: [
							"node_modules/*",
							"dist/*",
							"build/*",
							"*.min.js",
						],
						max_file_size: 102400, // 100KB limit per file
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										summary,
										tree,
										content,
										analysis: {
											language,
											patterns_used: patternMap[language],
											repo_url,
										},
									},
									null,
									2,
								),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										error: "Failed to analyze code files",
										message:
											error instanceof Error ? error.message : String(error),
										repo_url,
										language,
									},
									null,
									2,
								),
							},
						],
					};
				}
			},
		);

		// Tool for getting just documentation files
		this.server.tool(
			"get_repo_docs",
			"Retrieves only documentation files from a repository (README, markdown files, etc.)",
			{
				repo_url: z.string().describe("GitHub repository URL"),
			},
			async ({ repo_url }) => {
				try {
					const [summary, tree, content] = await ingest(repo_url, {
						include_patterns: ["*.md", "*.mdx", "*.txt", "LICENSE*", "README*"],
						max_file_size: 51200, // 50KB limit for docs
					});

					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										summary,
										tree,
										content,
										metadata: {
											type: "documentation",
											repo_url,
										},
									},
									null,
									2,
								),
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify(
									{
										error: "Failed to get repository documentation",
										message:
											error instanceof Error ? error.message : String(error),
										repo_url,
									},
									null,
									2,
								),
							},
						],
					};
				}
			},
		);
	}
}

// Export the handler for Cloudflare Workers
export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return GitIngestMCP.serveSSE("/sse").fetch(request, env, ctx);
	},
};
