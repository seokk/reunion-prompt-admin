
import { createClient } from '@libsql/client';
import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

// Construct the absolute path to config.yml
const configPath = path.resolve(process.cwd(), 'config.yml');

// Read the file synchronously
const configString = fs.readFileSync(configPath, 'utf8');

// The imported configString is a string, so we need to parse it.
const config = yaml.load(configString) as { 
  TURSO_DATABASE_URL?: string; 
  TURSO_AUTH_TOKEN?: string; 
};

const url = config.TURSO_DATABASE_URL;
const authToken = config.TURSO_AUTH_TOKEN;

if (!url) {
  // Now, this error will be caught at runtime if the URL is missing.
  throw new Error('TURSO_DATABASE_URL is not defined in config.yml');
}

export const db = createClient({
  url,
  authToken,
});
