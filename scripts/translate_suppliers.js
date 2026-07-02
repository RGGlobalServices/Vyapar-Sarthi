const fs = require('fs');

function replaceInFile(path, replacements) {
  let content = fs.readFileSync(path, 'utf8');
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replace(new RegExp(search, 'g'), replace);
  }
  fs.writeFileSync(path, content);
}

replaceInFile('app/[locale]/(main)/suppliers/SuppliersUI.tsx', {
  'import { useState': "import { useTranslations } from 'next-intl';\nimport { useState",
  'export default function SuppliersUI\\(\\) \\{': "export default function SuppliersUI() {\n  const t = useTranslations('Suppliers');",
  'Total Suppliers': "{t('totalSuppliers')}",
  'Total Outstanding': "{t('totalOutstanding')}",
  'Paid This Month': "{t('paidThisMonth')}",
  'New Supplier': "{t('newSupplier')}",
  'Add Supplier': "{t('addSupplier')}",
  'Edit Supplier': "{t('editSupplier')}",
  'Save Changes': "{t('save')}",
  'Cancel': "{t('cancel')}",
  'Supplier Name \\*': "{t('nameLabel')}",
  '>Mobile<': ">{t('mobileLabel')}<",
  '>GST Number<': ">{t('gstLabel')}<",
  '>Address<': ">{t('addressLabel')}<",
  '>Name<': ">{t('colName')}<",
  '>Contact<': ">{t('colContact')}<",
  '>Pending Due<': ">{t('colPending')}<",
  '>Actions<': ">{t('colActions')}<",
  'View Details': "{t('viewDetails')}",
  'Record Payment': "{t('recordPayment')}",
  'Payment Amount': "{t('paymentAmount')}",
  'Submit Payment': "{t('submitPayment')}",
  'Delete Supplier': "{t('deleteSupplier')}"
});

console.log('SuppliersUI.tsx updated.');
