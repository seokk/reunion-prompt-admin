
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
