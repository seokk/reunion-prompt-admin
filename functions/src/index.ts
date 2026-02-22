
import {onCall} from "firebase-functions/v2/https";
import {getDbClient} from "./db"; // Import the getter function
import * as logger from "firebase-functions/logger";

// It is recommended to set the region explicitly.
// See https://firebase.google.com/docs/functions/locations
import {setGlobalOptions} from "firebase-functions/v2";
setGlobalOptions({region: "us-central1"});

/**
 * A callable function to update a prompt version's content in the database.
 */
export const updatePrompt = onCall<{
  promptVersionId?: string,
  promptId?: string,
  newContent: string,
}>(
  {cors: true, invoker: "public"},
  async (request) => {
    // Get the database client instance at runtime.
    const db = getDbClient();

    const {promptVersionId, promptId, newContent} = request.data;
    const targetVersionId = promptVersionId ?? promptId;

    if (!targetVersionId || typeof newContent !== "string") {
      logger.error("Invalid request data", {data: request.data});
      // Break the error message into two lines to satisfy max-len
      const msg = "Invalid arguments. Expecting { promptVersionId: string, " +
                  "newContent: string }.";
      throw new Error(msg);
    }

    try {
      logger.info(
        `Updating prompt version ${targetVersionId} with new content.`
      );
      await db.execute({
        sql: "UPDATE prompt_versions SET content = ? WHERE id = ?",
        args: [newContent, targetVersionId],
      });

      logger.info(`Successfully updated prompt version ${targetVersionId}.`);
      return {
        success: true,
        message: "Prompt version updated successfully.",
      };
    } catch (error) {
      logger.error(
        `Error updating prompt version ${targetVersionId}:`,
        error
      );
      throw new Error("Failed to update prompt version in the database.");
    }
  });

/**
 * New callable name for prompt version updates.
 * Keeps same behavior as updatePrompt, but avoids legacy function config drift.
 */
export const updatePromptVersion = onCall<{
  promptVersionId?: string,
  promptId?: string,
  newContent: string,
}>(
  {cors: true, invoker: "public"},
  async (request) => {
    const db = getDbClient();

    const {promptVersionId, promptId, newContent} = request.data;
    const targetVersionId = promptVersionId ?? promptId;

    if (!targetVersionId || typeof newContent !== "string") {
      logger.error("Invalid request data", {data: request.data});
      const msg = "Invalid arguments. Expecting { promptVersionId: string, " +
                  "newContent: string }.";
      throw new Error(msg);
    }

    try {
      logger.info(
        `Updating prompt version ${targetVersionId} with new content.`
      );
      await db.execute({
        sql: "UPDATE prompt_versions SET content = ? WHERE id = ?",
        args: [newContent, targetVersionId],
      });

      logger.info(`Successfully updated prompt version ${targetVersionId}.`);
      return {
        success: true,
        message: "Prompt version updated successfully.",
      };
    } catch (error) {
      logger.error(
        `Error updating prompt version ${targetVersionId}:`,
        error
      );
      throw new Error("Failed to update prompt version in the database.");
    }
  }
);

/**
 * A callable function to create a new prompt version for a prompt type.
 * The new version number is max(version) + 1 within the same prompt_type_id.
 */
export const createPromptVersion = onCall<{
  promptTypeId: string,
  baseContent?: string,
}>(
  {cors: true, invoker: "public"},
  async (request) => {
    const db = getDbClient();
    const {promptTypeId, baseContent} = request.data;

    if (!promptTypeId) {
      logger.error("Invalid request data", {data: request.data});
      throw new Error(
        "Invalid arguments. Expecting { promptTypeId: string }."
      );
    }

    try {
      const nextVersionResult = await db.execute({
        sql: "SELECT COALESCE(MAX(version), 0) + 1 AS next_version " +
             "FROM prompt_versions WHERE prompt_type_id = ?",
        args: [promptTypeId],
      });

      const nextVersion = Number(
        nextVersionResult.rows[0]?.next_version ?? 1
      );
      const content = typeof baseContent === "string" ? baseContent : "";

      await db.execute({
        sql:
          "INSERT INTO prompt_versions " +
          "(prompt_type_id, version, content, is_active) " +
          "VALUES (?, ?, ?, 0)",
        args: [promptTypeId, nextVersion, content],
      });

      const createdRowResult = await db.execute({
        sql:
          "SELECT id, prompt_type_id, version, " +
          "content, is_active, created_at " +
          "FROM prompt_versions WHERE prompt_type_id = ? AND version = ? " +
          "ORDER BY id DESC LIMIT 1",
        args: [promptTypeId, nextVersion],
      });

      const row = createdRowResult.rows[0];
      if (!row) {
        throw new Error("Failed to load created prompt version.");
      }

      return {
        success: true,
        promptVersion: {
          id: String(row.id),
          promptTypeId: String(row.prompt_type_id),
          version: Number(row.version),
          content: String(row.content ?? ""),
          isActive: Boolean(row.is_active),
          createdAt: row.created_at ? String(row.created_at) : null,
        },
      };
    } catch (error) {
      logger.error(
        `Error creating prompt version for type ${promptTypeId}:`,
        error
      );
      throw new Error("Failed to create prompt version.");
    }
  },
);

/**
 * Sets one prompt version as active within its prompt type
 * and deactivates others.
 */
export const setActivePromptVersion = onCall<{
  promptTypeId: string,
  promptVersionId: string,
}>(
  {cors: true, invoker: "public"},
  async (request) => {
    const db = getDbClient();
    const {promptTypeId, promptVersionId} = request.data;

    if (!promptTypeId || !promptVersionId) {
      logger.error("Invalid request data", {data: request.data});
      throw new Error(
        "Invalid arguments. Expecting { promptTypeId: string, " +
          "promptVersionId: string }."
      );
    }

    try {
      await db.execute({
        sql:
          "UPDATE prompt_versions SET is_active = FALSE " +
          "WHERE prompt_type_id = ?",
        args: [promptTypeId],
      });

      await db.execute({
        sql:
          "UPDATE prompt_versions SET is_active = TRUE " +
          "WHERE id = ? AND prompt_type_id = ?",
        args: [promptVersionId, promptTypeId],
      });

      logger.info(
        "Set active prompt version " +
          `${promptVersionId} for prompt type ${promptTypeId}`
      );

      return {success: true};
    } catch (error) {
      logger.error(
        "Error setting active prompt version " +
          `${promptVersionId} for type ${promptTypeId}:`,
        error
      );
      throw new Error("Failed to set active prompt version.");
    }
  },
);

/**
 * Returns prompt types with their prompt versions for dashboard refresh.
 * Used by the static Hosting UI to load fresh DB state after page reload.
 */
export const getPromptDashboardData = onCall(
  {cors: true, invoker: "public"},
  async () => {
    const db = getDbClient();

    try {
      const [typesResult, versionsResult] = await Promise.all([
        db.execute({
          sql:
            "SELECT id, name, description " +
            "FROM prompt_types ORDER BY id ASC",
        }),
        db.execute({
          sql:
            "SELECT id, prompt_type_id, version, content, is_active, " +
            "created_at FROM prompt_versions ORDER BY prompt_type_id ASC, " +
            "is_active DESC, version DESC, id DESC",
        }),
      ]);

      const typeMap = new Map<string, {
        id: string,
        title: string,
        description: string,
        versions: Array<{
          id: string,
          version: number,
          content: string,
          isActive: boolean,
          createdAt: string | null,
        }>,
      }>();

      for (const row of typesResult.rows) {
        const id = String(row.id);
        typeMap.set(id, {
          id,
          title: String(row.name ?? ""),
          description: String(row.description ?? ""),
          versions: [],
        });
      }

      for (const row of versionsResult.rows) {
        const promptTypeId = String(row.prompt_type_id);
        const type = typeMap.get(promptTypeId);
        if (!type) continue;

        type.versions.push({
          id: String(row.id),
          version: Number(row.version ?? 0),
          content: String(row.content ?? ""),
          isActive: Boolean(row.is_active),
          createdAt: row.created_at ? String(row.created_at) : null,
        });
      }

      const promptTypes = Array.from(typeMap.values()).map((promptType) => ({
        ...promptType,
        versions: promptType.versions.sort((a, b) => {
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
          return b.version - a.version;
        }),
      }));

      return {success: true, promptTypes};
    } catch (error) {
      logger.error("Error loading prompt dashboard data:", error);
      throw new Error("Failed to load prompt dashboard data.");
    }
  }
);
