const fs = require('fs');

function replaceInFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replace(new RegExp(search, 'g'), replace);
  }
  fs.writeFileSync(path, content);
}

replaceInFile('app/[locale]/(main)/billing/WholesaleBillingUI.tsx', {
  'placeholder="Search product or scan barcode \\(F3 to focus\\)..."': 'placeholder={t("searchProductOrScan")}',
  '>Mobile Scanner<': ">{t('mobileScanner')}<",
  '>Quick Add<': ">{t('quickAdd')}<",
  '>PRICING MODE<': ">{t('pricingMode')}<",
  '>Wholesale<': ">{t('wholesale')}<",
  '>Retail<': ">{t('retail')}<",
  '>PRODUCT<': ">{t('product')}<",
  '>QTY<': ">{t('qty')}<",
  '>PRICE<': ">{t('price')}<",
  '>TOTAL<': ">{t('totalUpper')}<",
  '>ACT<': ">{t('act')}<",
  '>Cart is empty<': ">{t('cartEmpty')}<",
  '>Scan a barcode or search for products to begin<': ">{t('cartEmptyDesc')}<",
  '>Order Summary<': ">{t('orderSummary')}<",
  'Items \\(\\{items.length\\}\\)': "{t('itemsCount', { count: items.length })}",
  '>Discount<': ">{t('discount')}<",
  '>Total Payable<': ">{t('totalPayable')}<",
  '>PAYMENT METHOD<': ">{t('paymentMethod')}<",
  '>Cash<': ">{t('cash')}<",
  '>UPI<': ">{t('upi')}<",
  '>Card<': ">{t('card')}<",
  '>Udhar<': ">{t('udhar')}<",
  '>Checkout <': ">{t('checkout')} <",
  '>Checkout<': ">{t('checkout')}<",
  '>Customer Details \\(Optional\\)<': ">{t('customerDetails')}<",
  'Customer Name': "{t('nameLabel')}",
  '>Mobile<': ">{t('mobileLabel')}<",
  '>Email<': ">{t('emailLabel')}<",
  '>Amount Paid<': ">{t('amountPaid')}<",
  '>Save Bill<': ">{t('saveBill')}<",
  '>Print Receipt<': ">{t('printReceipt')}<",
  '>Share on WhatsApp<': ">{t('shareWhatsapp')}<",
  '>New Bill<': ">{t('newBill')}<",
  '>Manual Add<': ">{t('manualAdd')}<"
});

console.log('WholesaleBillingUI.tsx updated.');
