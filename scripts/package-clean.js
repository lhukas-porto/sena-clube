/**
 * Script de Empacotamento Seguro — SenaClube
 * Cria um arquivo ZIP limpo do projeto excluindo terminantemente segredos,
 * arquivos de ambiente (.env*), metadados de deploy (.vercel*),
 * histórico de versionamento (.git*) e backups locais.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outputFile = path.join(DIST_DIR, `senaclube-release-${timestamp}.zip`);

console.log('[Pacote Seguro] Gerando pacote de distribuição limpo...');

// Tenta usar git archive se git estiver disponível
try {
  execSync(`git archive -o "${outputFile}" HEAD`, { cwd: ROOT_DIR });
  console.log(`[Pacote Seguro] ✅ Pacote gerado com sucesso via Git Archive em: ${outputFile}`);
  console.log('[Pacote Seguro] Nenhum arquivo .env, .git ou node_modules foi incluído.');
} catch (gitErr) {
  // Fallback caso não seja repositório git ou falhe
  console.log('[Pacote Seguro] Git archive indisponível, usando script de compactação com filtros estritos...');
  const excludeList = [
    '.env',
    '.env.*',
    '.git',
    '.vercel',
    'node_modules',
    'dist',
    'data/backups',
    'data/admin-auth.json'
  ];
  
  if (process.platform === 'win32') {
    const psScript = `
      $dest = "${outputFile}";
      $files = Get-ChildItem -Path "${ROOT_DIR}" -Recurse | Where-Object {
        $full = $_.FullName;
        $rel = $full.Substring("${ROOT_DIR}".Length + 1);
        -not ($rel -like ".env*" -or $rel -like ".git*" -or $rel -like ".vercel*" -or $rel -like "node_modules*" -or $rel -like "dist*" -or $rel -like "data\\backups*" -or $rel -like "data\\admin-auth.json*")
      };
      Compress-Archive -Path $files.FullName -DestinationPath $dest -Force;
    `;
    execSync(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`, { cwd: ROOT_DIR });
  } else {
    execSync(`zip -r "${outputFile}" . -x "*.env*" "*.git*" "*.vercel*" "*node_modules*" "*dist*" "*data/backups*" "*data/admin-auth.json*"`, { cwd: ROOT_DIR });
  }
  console.log(`[Pacote Seguro] ✅ Pacote gerado com sucesso em: ${outputFile}`);
}

