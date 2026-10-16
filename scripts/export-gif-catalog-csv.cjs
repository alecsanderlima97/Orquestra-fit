/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const classifyFemaleAudience = (item) => {
  const parts = String(item.file || '').split('/').map((part) => part.toUpperCase());
  const equipment = String(item.equipment || parts[1] || '').toUpperCase();
  const muscle = String(item.muscle || parts[2] || '').toUpperCase();
  const name = String(item.name || '').toLowerCase();
  return !name.includes('femal') || equipment === 'CARDIO' || muscle === 'GERAL' ? 'geral' : 'feminino';
};
const catalogs = [
  ...JSON.parse(fs.readFileSync(path.join(root, 'public', 'gif-catalog.json'), 'utf8')).map((item) => ({ ...item, profile: 'masculino' })),
  ...JSON.parse(fs.readFileSync(path.join(root, 'public', 'gif-catalog-feminine.json'), 'utf8')).map((item) => ({ ...item, profile: classifyFemaleAudience(item) })),
];

const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const rows = ['perfil,nome,arquivo,equipamento,musculo'];
for (const item of catalogs) {
  rows.push([
    item.profile,
    item.name.replace(/\.gif$/i, ''),
    item.file,
    item.equipment,
    item.muscle,
  ].map(escape).join(','));
}

fs.writeFileSync(path.join(root, 'reports', 'catalogo-gifs-completo.csv'), `\ufeff${rows.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ rows: catalogs.length, output: 'reports/catalogo-gifs-completo.csv' }, null, 2));
