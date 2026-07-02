const fs = require('fs');

function replaceInFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replace(new RegExp(search, 'g'), replace);
  }
  fs.writeFileSync(path, content);
}

replaceInFile('app/[locale]/(main)/purchases/page.tsx', {
  "useTranslations\\('Godowns'\\)": "useTranslations('Purchases')",
  "t\\('udyogRequired'\\)": "t('udyogRequired')", // Re-used or mapped correctly, changing to useTranslations('Purchases') means we need it in Purchases json
  '> Purchases<': ">{t('title')}<",
  'Udyog Plan Required': "{t('udyogRequired')}",
  'Purchase management is available on the Udyog plan.': "{t('udyogDesc')}",
  'Upgrade to Udyog': "{t('upgradeBtn')}",
  'Add Purchase': "{t('addPurchase')}",
  'New Purchase': "{t('newPurchase')}",
  'Save Purchase': "{t('savePurchase')}",
  'Cancel': "{t('cancel')}",
  'Supplier': "{t('supplierLabel')}",
  'Warehouse / Godown': "{t('warehouseLabel')}",
  'Invoice Number': "{t('invoiceLabel')}",
  'Date': "{t('dateLabel')}",
  'Search purchases by invoice...': "{t('searchPlaceholder')}",
  'Total Purchases': "{t('totalPurchases')}",
  '>Invoice<': ">{t('colInvoice')}<",
  '>Supplier<': ">{t('colSupplier')}<", // Careful about duplicate match with Supplier Label
  '>Amount<': ">{t('colAmount')}<",
  '>Date<': ">{t('colDate')}<",
  '>Actions<': ">{t('colActions')}<",
  'View Details': "{t('viewDetails')}",
  'No purchases found': "{t('noPurchases')}",
  'Select Supplier': "{t('selectSupplier')}",
  'Select Warehouse': "{t('selectWarehouse')}",
  'Select Product': "{t('selectProduct')}",
  '>Product<': ">{t('product')}<",
  'Quantity': "{t('quantity')}",
  'Cost Price': "{t('costPrice')}",
  'Batch Number \\(Optional\\)': "{t('batchNumber')}",
  'Add Item': "{t('addItem')}",
  '>Remove<': ">{t('remove')}<",
  'New Supplier': "{t('newSupplier')}",
  'Add New Supplier': "{t('addNewSupplier')}",
  'Supplier Name': "{t('supplierName')}",
  '>Save<': ">{t('saveSupplier')}<",
  'Total Amount': "{t('totalAmount')}",
  ' items': " {t('items')}"
});

console.log('Purchases page updated.');
