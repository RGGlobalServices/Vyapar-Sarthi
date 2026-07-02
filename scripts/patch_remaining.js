const fs = require('fs');

const pagePath = 'c:/current working project/kirana-manager-main/app/[locale]/(main)/page.tsx';
let content = fs.readFileSync(pagePath, 'utf8');

const replacements = {
  'Fast Moving Items': "{t('fastMovingItems')}",
  'TOP BY VOLUME': "{t('topByVolume')}",
  'Slow Moving Items': "{t('slowMovingItems')}",
  'NEED ATTENTION': "{t('needAttention')}",
  ' units sold': " {t('unitsSold')}",
  ' in stock': " {t('inStock')}"
};

for (const [search, replace] of Object.entries(replacements)) {
  content = content.replace(new RegExp(search, 'g'), replace);
}

fs.writeFileSync(pagePath, content);
