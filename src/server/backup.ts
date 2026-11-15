// Sauvegarde à chaud de la base SQLite : data/backups/grimoire-AAAAMMJJ-HHMMSS.sqlite
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { db, DATA_DIR } from './db';

const dir = join(DATA_DIR, 'backups');
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const target = join(dir, `grimoire-${stamp}.sqlite`);
await db.backup(target);
console.log(`Sauvegarde écrite : ${target}`);
