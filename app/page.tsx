
import { db } from '@/lib/db';
import { PromptManager } from './prompts/manager';

interface PromptVersion {
  id: string;
  version: number;
  content: string;
  isActive: boolean;
  createdAt: string | null;
}

interface PromptType {
  id: string;
  title: string;
  description: string;
  versions: PromptVersion[];
}

async function getPrompts(): Promise<PromptType[]> {
  const [typesResult, versionsResult] = await Promise.all([
    db.execute('SELECT id, name, description FROM prompt_types ORDER BY id ASC'),
    db.execute(
      'SELECT id, prompt_type_id, version, content, is_active, created_at FROM prompt_versions ORDER BY prompt_type_id ASC, is_active DESC, version DESC, id DESC',
    ),
  ]);

  const typeMap = new Map<string, PromptType>();

  for (const row of typesResult.rows) {
    const id = String(row.id);
    typeMap.set(id, {
      id,
      title: String(row.name),
      description: String(row.description ?? ''),
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
      content: String(row.content ?? ''),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at ? String(row.created_at) : null,
    });
  }

  return Array.from(typeMap.values()).map((promptType) => ({
    ...promptType,
    versions: promptType.versions.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.version - a.version;
    }),
  }));
}

export default async function HomePage() {
  const prompts = await getPrompts();

  return <PromptManager promptTypes={prompts} />;
}
