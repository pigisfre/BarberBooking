// Carica brands/<id>/brand.json per app.config.ts. CommonJS perche lo legge la config di Expo.
const fs = require('fs');
const path = require('path');

function loadBrand(id) {
  const brandId = id || process.env.BRAND || 'demo';
  const dir = path.join(__dirname, brandId);
  const file = path.join(dir, 'brand.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Brand "${brandId}" non trovato: manca ${file}. Copia brands/_template.`);
  }
  // La serializzazione della config di Expo trasforma null in {} (che e "vero"):
  // togliamo le chiavi null, cosi nelle app un valore assente e davvero undefined.
  const brand = JSON.parse(fs.readFileSync(file, 'utf8'), (_k, v) => (v === null ? undefined : v));
  // asset del brand se presenti, altrimenti quelli segnaposto dell'app
  const asset = (rel) => {
    if (!rel) return null;
    const p = path.join(dir, rel);
    return fs.existsSync(p) ? p : null;
  };
  return { brand, asset };
}

module.exports = { loadBrand };
