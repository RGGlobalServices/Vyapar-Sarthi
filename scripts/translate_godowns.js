const fs = require('fs');

function replaceInFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replace(new RegExp(search, 'g'), replace);
  }
  fs.writeFileSync(path, content);
}

replaceInFile('app/[locale]/(main)/godowns/WarehousesUI.tsx', {
  'import { useState': "import { useTranslations } from 'next-intl';\nimport { useState",
  'export default function WarehousesUI\\(\\) \\{': "export default function WarehousesUI() {\n  const t = useTranslations('Godowns');",
  'Total Products': "{t('totalProducts')}",
  'Total Units': "{t('totalUnits')}",
  'Stock Value': "{t('stockValue')}",
  '>Low Stock<': ">{t('lowStock')}<",
  '>Out of Stock<': ">{t('outOfStock')}<",
  'Transfer Stock': "{t('transferStock')}",
  'Receive Purchase': "{t('receivePurchase')}",
  'Adjust Stock': "{t('adjustStock')}"
});

console.log('WarehousesUI.tsx updated.');
