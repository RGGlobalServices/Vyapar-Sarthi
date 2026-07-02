const fs = require('fs');
const files = ['en.json', 'hi.json', 'mr.json'];
const data = {
  'Dashboard': {
    'title': 'Dashboard',
    'businessHealth': 'Business health at a glance',
    'today': 'Today',
    'last7Days': 'Last 7 Days',
    'weekly': 'Weekly',
    'monthly': 'Monthly',
    'custom': 'Custom',
    'hideProfit': 'Hide Profit',
    'showProfit': 'Show Profit',
    'todaysSales': "TODAY'S SALES",
    'todaysProfit': "TODAY'S PROFIT",
    'totalUdhar': 'TOTAL UDHAR',
    'todaysReturns': "TODAY'S RETURNS",
    'lowStockAlerts': 'LOW STOCK',
    'topProducts': 'Top Products',
    'all': 'All',
    'units': 'units',
    'stockAlerts': 'Stock Alerts',
    'stockHealthy': 'Stock levels are healthy',
    'recentInvoices': 'Recent Invoices',
    'fastMovingItems': 'Fast Moving Items',
    'topByVolume': 'TOP BY VOLUME',
    'slowMovingItems': 'Slow Moving Items',
    'needAttention': 'NEED ATTENTION',
    'unitsSold': 'units sold',
    'inStock': 'in stock',
    'materialReturns': 'Material Returns',
    'manageReturns': 'Manage Returns',
    'noReturns': 'No returns recorded for Today'
  }
};
files.forEach(file => {
  const path = `messages/${file}`;
  let content = JSON.parse(fs.readFileSync(path, 'utf8'));
  content.Dashboard = data.Dashboard;
  fs.writeFileSync(path, JSON.stringify(content, null, 2));
});
