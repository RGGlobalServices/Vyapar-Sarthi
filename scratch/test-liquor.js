// Replicate LIQUOR_RULES + resolver to confirm category→variant mapping.
const LIQUOR_RULES = [
  { match: ['beer','cider','lager','ale','stout'], spec: {typeLabel:'Volume',typeOptions:['330ml','500ml','650ml'],sizeLabel:'Type',sizeChart:['Bottle','Can','PET','Pint','Pack of 6','Case']} },
  { match: ['whisky','whiskey','rum','vodka','gin','brandy','scotch','wine','liquor','liqueur','spirit','tequila','champagne','sherry','port'], spec: {typeLabel:'Volume',typeOptions:['90ml','180ml','375ml','500ml','750ml','1000ml'],sizeLabel:'Type',sizeChart:['Bottle','Nip','Pint','Quart','Case']} },
  { match: ['water','soft drink','soda','cola','juice','tonic','drink','mixer','energy'], spec: {typeLabel:'Volume',typeOptions:['200ml','250ml','330ml','500ml','750ml','1L','2L'],sizeLabel:'Type',sizeChart:['Bottle','Can','PET','Tetra','Pack']} },
];
function resolve(cat){ const c=(cat||'').toLowerCase().trim(); for(const {match,spec} of LIQUOR_RULES){ if(match.some(m=>c.includes(m))) return spec; } return null; }
const cats = ['Beer','Wine','Whisky','Rum','Vodka','Gin','Brandy','Scotch','Water Bottle','Soft Drinks','Snacks','Cigarettes'];
for (const c of cats) {
  const s = resolve(c);
  console.log(`${c.padEnd(14)} -> ${s ? `${s.typeLabel}[${s.typeOptions.length}] × ${s.sizeLabel}[${s.sizeChart.length}]` : 'simple single-stock (no variant)'}`);
}
