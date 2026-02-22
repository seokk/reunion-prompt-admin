
import {createClient, Client} from "@libsql/client";
import {defineString} from "firebase-functions/params";

// Define the database URL and auth token as parameters.
const tursoDatabaseUrl = defineString("TURSO_DATABASE_URL");
const tursoAuthToken = defineString("TURSO_AUTH_TOKEN");

let db: Client | null = null;

/**
 * Returns a singleton instance of the database client.
 * The client is initialized on the first call.
 * @return {Client} The singleton database client instance.
 */
export function getDbClient(): Client {
  if (!db) {
    // The .value() calls are now safely inside a function, ensuring they
    // run at runtime, not deployment time.
    db = createClient({
      url: tursoDatabaseUrl.value(),
      authToken: tursoAuthToken.value(),
    });
  }
  return db;
}
