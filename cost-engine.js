// RemPro Control V2 — motor de costeo automático de materiales.
// Convierte presentaciones comerciales a la unidad de consumo del calculador.
// Si no existe una conversión trazable, devuelve estado pendiente: nunca adivina.
((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RemProCostEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const normalize = value => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/[^a-z0-9./"\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function canonicalUnit(value) {
    const u = normalize(value);
    if (/\b(m2|m 2|metro cuadrado|metros cuadrados)\b/.test(u)) return 'm2';
    if (/\b(m3|m 3|metro cubico|metros cubicos)\b/.test(u)) return 'm3';
    if (/\b(ml|metro lineal|metros lineales)\b/.test(u)) return 'ml';
    if (/\b(kg|kilogramo|kilogramos)\b/.test(u)) return 'kg';
    if (/\b(l|lt|lts|litro|litros)\b/.test(u)) return 'l';
    if (/\b(pza|pzas|pieza|piezas)\b/.test(u)) return 'pza';
    return u;
  }

  const numberFrom = value => {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  function isWholePackagePresentation(price) {
    const unit = normalize(price?.unit);
    return /\b(caja|cja|paquete|paq)\b/.test(unit);
  }

  function dimensionPair(text) {
    const t = normalize(text);
    const match = t.match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*m\b/);
    if (!match) return null;
    const a = numberFrom(match[1]);
    const b = numberFrom(match[2]);
    return a && b ? [a,b] : null;
  }

  function presentationCapacity(price, targetUnit) {
    const target = canonicalUnit(targetUnit);
    const unit = normalize(price?.unit);
    const item = normalize(price?.item);
    const all = `${unit} ${item}`;

    if (!target) return { ok:false, reason:'Unidad de consumo no definida.' };

    if (target === 'pza') {
      if (/\bmillar\b/.test(unit)) return { ok:true, capacity:1000, baseUnit:'pza' };
      const counted = all.match(/(?:c\/?|caja(?:\s+de)?|paquete(?:\s+de)?)?\s*(\d+(?:[.,]\d+)?)\s*(?:pzas?|piezas?)\b/);
      if (counted) {
        const capacity = numberFrom(counted[1]);
        if (capacity) return { ok:true, capacity, baseUnit:'pza' };
      }
      const packageCount = unit.match(/\bpaquete\s+(\d+(?:[.,]\d+)?)\b/);
      if (packageCount) {
        const capacity = numberFrom(packageCount[1]);
        if (capacity) return { ok:true, capacity, baseUnit:'pza' };
      }
      if (/^(pieza|pza)\b/.test(unit) || /\bpieza\s+\d/.test(unit)) return { ok:true, capacity:1, baseUnit:'pza' };
      return { ok:false, reason:`La presentación "${price?.unit || 'sin unidad'}" no indica cuántas piezas contiene.` };
    }

    if (target === 'kg') {
      if (/^(kg|kilogramo)/.test(unit)) return { ok:true, capacity:1, baseUnit:'kg' };
      const kg = all.match(/(\d+(?:[.,]\d+)?)\s*kg\b/);
      if (kg) {
        const capacity = numberFrom(kg[1]);
        if (capacity) return { ok:true, capacity, baseUnit:'kg' };
      }
      return { ok:false, reason:`No existe equivalencia trazable de "${price?.unit || 'sin unidad'}" a kg.` };
    }

    if (target === 'm2') {
      if (/^(m2|metro cuadrado)/.test(unit)) return { ok:true, capacity:1, baseUnit:'m2' };
      const m2 = unit.match(/(\d+(?:[.,]\d+)?)\s*m2\b/);
      if (m2) {
        const capacity = numberFrom(m2[1]);
        if (capacity) return { ok:true, capacity, baseUnit:'m2' };
      }
      if (/\brollo\b/.test(unit)) {
        const pair = dimensionPair(all);
        if (pair) return { ok:true, capacity:pair[0]*pair[1], baseUnit:'m2' };
      }
      return { ok:false, reason:`No existe equivalencia trazable de "${price?.unit || 'sin unidad'}" a m².` };
    }

    if (target === 'ml') {
      if (/^(ml|metro lineal|m\b)/.test(unit)) return { ok:true, capacity:1, baseUnit:'ml' };
      const linear = unit.match(/(?:rollo\s*)?(\d+(?:[.,]\d+)?)\s*m\b/);
      if (linear && !/m2\b/.test(unit)) {
        const capacity = numberFrom(linear[1]);
        if (capacity) return { ok:true, capacity, baseUnit:'ml' };
      }
      if (/\brollo\b/.test(unit)) {
        const pair = dimensionPair(all);
        if (pair) return { ok:true, capacity:pair[1], baseUnit:'ml' };
      }
      return { ok:false, reason:`No existe equivalencia trazable de "${price?.unit || 'sin unidad'}" a ml.` };
    }

    if (target === 'm3') {
      if (/^(m3|metro cubico)/.test(unit)) return { ok:true, capacity:1, baseUnit:'m3' };
      return { ok:false, reason:`No existe equivalencia trazable de "${price?.unit || 'sin unidad'}" a m³.` };
    }

    if (target === 'l') {
      if (/^(l|lt|litro)/.test(unit)) return { ok:true, capacity:1, baseUnit:'l' };
      const liters = all.match(/(\d+(?:[.,]\d+)?)\s*(?:l|lt|lts|litros?)\b/);
      if (liters) {
        const capacity = numberFrom(liters[1]);
        if (capacity) return { ok:true, capacity, baseUnit:'l' };
      }
      return { ok:false, reason:`No existe equivalencia trazable de "${price?.unit || 'sin unidad'}" a litros.` };
    }

    if (normalize(price?.unit) === normalize(targetUnit)) return { ok:true, capacity:1, baseUnit:target };
    return { ok:false, reason:`Unidad de compra "${price?.unit || 'sin unidad'}" incompatible con "${targetUnit}".` };
  }

  const stamp = row => Date.parse(row?.date || row?.updated_at || 0) || 0;

  function hintScore(item, hint) {
    const haystack = normalize(item);
    const tokens = normalize(hint).split(' ').filter(t => t.length > 1);
    if (!tokens.length || !tokens.every(t => haystack.includes(t))) return 0;
    return tokens.length * 10 + Math.min(normalize(hint).length, 50);
  }

  function findBestPrice(prices, hints = [], exclude = []) {
    const candidates = (Array.isArray(prices) ? prices : [])
      .filter(p => !p?.deleted)
      .filter(p => !exclude.some(term => normalize(p.item).includes(normalize(term))))
      .map(p => ({
        price:p,
        score:Math.max(0, ...hints.map(h => hintScore(p.item, h)))
      }))
      .filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score || stamp(b.price) - stamp(a.price));
    return candidates[0]?.price || null;
  }

  function costWithPrice(material, price) {
    const quantity = Number(material?.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return { ...material, status:'invalid', reason:'Cantidad inválida.', price:null, unitCost:null, amount:null };
    }
    if (material?.costable === false) {
      return { ...material, status:'auxiliary', reason:material.reason || 'Renglón auxiliar de cuantificación; no representa una compra independiente.', price:null, unitCost:0, amount:0 };
    }
    if (!price) {
      return { ...material, status:'missing-price', reason:'No hay un precio vigente compatible en el catálogo.', price:null, unitCost:null, amount:null };
    }
    const conversion = presentationCapacity(price, material.unit);
    if (!conversion.ok) {
      return { ...material, status:'conversion-pending', reason:conversion.reason, price, unitCost:null, amount:null, conversion };
    }
    const gross = Number(price.net || 0) * (1 + Number(price.vat || 0) / 100);
    if (!Number.isFinite(gross) || gross < 0) {
      return { ...material, status:'invalid-price', reason:'El precio del catálogo no es válido.', price, unitCost:null, amount:null, conversion };
    }
    const unitCost = gross / conversion.capacity;
    const wholePackage = isWholePackagePresentation(price) && conversion.capacity > 1;
    const purchaseQuantity = wholePackage
      ? (quantity > 0 ? Math.ceil(quantity / conversion.capacity) : 0)
      : quantity / conversion.capacity;
    const unusedQuantity = wholePackage
      ? Math.max(0, purchaseQuantity * conversion.capacity - quantity)
      : 0;
    const amount = wholePackage ? purchaseQuantity * gross : quantity * unitCost;
    return {
      ...material,
      status:'priced',
      reason:'',
      price,
      conversion,
      purchaseGross:gross,
      unitCost,
      purchaseMode:wholePackage ? 'whole-package' : 'fractional',
      purchaseQuantity,
      purchaseUnit:price?.unit || '',
      technicalQuantity:quantity,
      technicalUnit:material?.unit || '',
      unusedQuantity,
      inventoryDisposition:wholePackage ? 'not-added' : 'not-applicable',
      amount
    };
  }

  function costMaterial(material, prices) {
    if (material?.costable === false) return costWithPrice(material, null);
    const price = material?.price || findBestPrice(prices, material?.hints || [], material?.exclude || []);
    return costWithPrice(material, price);
  }

  function costMaterials(materials, prices) {
    const rows = (Array.isArray(materials) ? materials : []).map(m => costMaterial(m, prices));
    const priced = rows.filter(r => r.status === 'priced');
    const pending = rows.filter(r => !['priced','auxiliary'].includes(r.status));
    return {
      rows,
      subtotal:priced.reduce((sum,row) => sum + row.amount, 0),
      pricedCount:priced.length,
      pendingCount:pending.length,
      auxiliaryCount:rows.filter(r => r.status === 'auxiliary').length,
      complete:pending.length === 0
    };
  }

  return Object.freeze({
    normalize,
    canonicalUnit,
    presentationCapacity,
    isWholePackagePresentation,
    findBestPrice,
    costWithPrice,
    costMaterial,
    costMaterials
  });
});
