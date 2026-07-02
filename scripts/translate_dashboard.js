const fs = require('fs');

function replaceInFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replace(new RegExp(search, 'g'), replace);
  }
  fs.writeFileSync(path, content);
  console.log(`Updated ${path}`);
}

const dashboardReplacements = {
  // Title & Headers
  "Business health at a glance": "{t('businessHealth')}",
  "'Today'": "t('today')",
  "'Last 7 Days'": "t('last7Days')",
  "'Weekly'": "t('weekly')",
  "'Monthly'": "t('monthly')",
  "'Custom'": "t('custom')",
  "'Hide Profit' : 'Show Profit'": "t('hideProfit') : t('showProfit')",
  "Top Products<": "{t('topProducts')}<",
  "Top Products": "{t('topProducts')}",
  "Stock Alerts<": "{t('stockAlerts')}<",
  "Stock levels are healthy": "{t('stockHealthy')}",
  "Recent Invoices<": "{t('recentInvoices')}<",
  "Material Returns \\(Today's \\)": "{t('materialReturns')}",
  "Manage Returns": "{t('manageReturns')}",
  "No returns recorded for Today": "{t('noReturns')}",

  // Common buttons / texts
  ">All<": ">{t('all')}<",
  " units<": " {t('units')}<"
};

// Also we need to handle the dynamic titles.
// Currently it's: getDynamicTitle('Sales') -> we should probably map these manually if needed, or leave getDynamicTitle alone and translate inside getDynamicTitle

const pagePath = 'c:/current working project/kirana-manager-main/app/[locale]/(main)/page.tsx';
replaceInFile(pagePath, dashboardReplacements);

// For WholesaleWidgets.tsx
const widgetsReplacements = {
  "Fast Moving Items": "{t('fastMovingItems')}",
  "TOP BY VOLUME": "{t('topByVolume')}",
  "Slow Moving Items": "{t('slowMovingItems')}",
  "NEED ATTENTION": "{t('needAttention')}",
  " units sold": " {t('unitsSold')}",
  " in stock": " {t('inStock')}"
};

const widgetsPath = 'c:/current working project/kirana-manager-main/app/[locale]/(main)/WholesaleWidgets.tsx';
replaceInFile(widgetsPath, widgetsReplacements);

