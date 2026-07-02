const fs = require('fs');
const file = 'app/[locale]/(main)/purchases/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add translation keys (using string replace for safety)
content = content.replace(/Record Purchase Invoice/g, "{t('recordPurchaseInvoice') || 'Record Purchase Invoice'}");
content = content.replace(/Receive stock into your warehouse./g, "{t('receiveStockDesc') || 'Receive stock into your warehouse.'}");
content = content.replace(/Invoice Details/g, "{t('invoiceDetails') || 'Invoice Details'}");
content = content.replace(/>Supplier /g, ">{t('supplierLabel') || 'Supplier'} ");
content = content.replace(/Enter supplier name.../g, "{t('enterSupplierName') || 'Enter supplier name...'}");
content = content.replace(/>Save</g, ">{t('save') || 'Save'}<");
content = content.replace(/>Select Supplier</g, ">{t('selectSupplier') || 'Select Supplier'}<");
content = content.replace(/>Warehouse Location /g, ">{t('warehouseLocation') || 'Warehouse Location'} ");
content = content.replace(/>Select Warehouse</g, ">{t('selectWarehouse') || 'Select Warehouse'}<");
content = content.replace(/>Invoice Number</g, ">{t('invoiceNumber') || 'Invoice Number'}<");
content = content.replace(/>Purchase Date</g, ">{t('purchaseDate') || 'Purchase Date'}<");
content = content.replace(/>Items</g, ">{t('itemsLabel') || 'Items'}<");
content = content.replace(/>Product</g, ">{t('productLabel') || 'Product'}<");
content = content.replace(/>Select Product\.\.\.</g, ">{t('selectProduct') || 'Select Product...'}<");
content = content.replace(/>Qty</g, ">{t('qty') || 'Qty'}<");
content = content.replace(/>Unit Cost</g, ">{t('unitCost') || 'Unit Cost'}<");
content = content.replace(/>Batch \(Opt\)</g, ">{t('batchOptional') || 'Batch (Opt)'}<");
content = content.replace(/> Add Another Product/g, "> {t('addAnotherProduct') || 'Add Another Product'}");
content = content.replace(/>\s*Record Purchase\s*</g, ">{t('recordPurchase') || 'Record Purchase'}<");
content = content.replace(/>\s*Purchases\s*</g, ">{t('purchasesTitle') || 'Purchases'}<");
content = content.replace(/>Manage supplier invoices and inward stock.</g, ">{t('purchasesSubtitle') || 'Manage supplier invoices and inward stock.'}<");
content = content.replace(/>\s*New Purchase\s*</g, "> {t('newPurchase') || 'New Purchase'}");
content = content.replace(/>No purchases recorded yet</g, ">{t('noPurchases') || 'No purchases recorded yet'}<");
content = content.replace(/>Start tracking your inventory by recording a purchase from your suppliers.</g, ">{t('startTracking') || 'Start tracking your inventory by recording a purchase from your suppliers.'}<");
content = content.replace(/>Record First Purchase</g, ">{t('recordFirstPurchase') || 'Record First Purchase'}<");
content = content.replace(/>Date</g, ">{t('dateLabel') || 'Date'}<");
content = content.replace(/>Invoice #</g, ">{t('invoiceHash') || 'Invoice #'}<");
content = content.replace(/>Total Amount</g, ">{t('totalAmount') || 'Total Amount'}<");
content = content.replace(/> items/g, "> {t('items') || 'items'}");
content = content.replace(/ units\)/g, " {t('units') || 'units'})");

// Add translation hook if not present
if (!content.includes("const t = useTranslations('Purchases');")) {
  content = content.replace(/export default function PurchasesPage\(\) \{/, 
    "export default function PurchasesPage() {\n  const t = useTranslations('Purchases');");
}

// Add state for selected invoice
if (!content.includes('selectedInvoice')) {
  content = content.replace(/const \[showAdd, setShowAdd\] = useState\(false\);/, 
    "const [showAdd, setShowAdd] = useState(false);\n  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);");
}

// Make rows clickable
content = content.replace(/<tr key=\{inv\.id\} className="hover:bg-slate-50 dark:hover:bg-slate-800\/40 transition-colors">/, 
  `<tr key={inv.id} onClick={() => setSelectedInvoice(inv)} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer">`);

// Add Modal at the end of the file
const modalCode = `
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedInvoice(null)} />
          <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-10">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="text-emerald-500" />
                {t('purchaseDetails') || 'Purchase Details'}
              </h2>
              <button onClick={() => setSelectedInvoice(null)} className="p-2 -mr-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-full transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('supplierLabel') || 'Supplier'}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedInvoice.supplier?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('invoiceHash') || 'Invoice #'}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">{selectedInvoice.invoiceNumber || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('dateLabel') || 'Date'}</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{new Date(selectedInvoice.date).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{t('totalAmount') || 'Total Amount'}</p>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">₹{(selectedInvoice.totalCost || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                </div>
              </div>
              
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                 <Package size={14}/> {t('itemsLabel') || 'Items'}
              </h3>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('productLabel') || 'Product'}</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('qty') || 'Qty'}</th>
                      <th className="px-4 py-3 font-bold text-xs uppercase tracking-wider text-right text-slate-500 dark:text-slate-400">{t('unitCost') || 'Unit Cost'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedInvoice.purchaseItems?.map((item) => (
                      <tr key={item.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-4 py-3 text-slate-900 dark:text-slate-200 font-bold">{item.product?.name}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{item.quantity}</td>
                        <td className="px-4 py-3 text-slate-900 dark:text-white text-right font-mono font-medium">₹{(item.cost || 0).toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button onClick={() => setSelectedInvoice(null)} className="px-5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                {t('close') || 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

content = content.replace(/    <\/div>\n  \);\n}\n$/, modalCode);

fs.writeFileSync(file, content);
console.log('Purchases page updated successfully via JS script');
