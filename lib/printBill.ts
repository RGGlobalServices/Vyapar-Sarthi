/**
 * Prints the on-screen bill at the correct paper size.
 *
 * Why not plain window.print(): the global print stylesheet hard-coded an
 * 80mm page and pinned #print-area with position:fixed, so A4 bills printed on
 * a tiny 80mm page (or got cut to one page) and thermal bills were squeezed
 * into a clipped, blurry layout. Here we clone just the bill into a flow-layout
 * root under <body>, set @page to the real paper size, print, then clean up.
 * Bills mark themselves with data-print-format="a4" | "thermal58" | "thermal80".
 */

const ROOT_ID = 'print-root';
const STYLE_ID = 'print-page-style';

const PAGE_CSS: Record<string, string> = {
  a4: '@page { size: A4 portrait; margin: 8mm; }',
  thermal80: '@page { size: 80mm auto; margin: 0; }',
  thermal58: '@page { size: 58mm auto; margin: 0; }',
};

function findBill(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('#print-area [data-print-format]') ||
    document.querySelector<HTMLElement>('#print-area-modal [data-print-format]') ||
    document.querySelector<HTMLElement>('[data-print-format]')
  );
}

function cleanup() {
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  document.body.classList.remove('printing-bill');
}

export function printBill(): void {
  const bill = findBill();
  if (!bill) {
    window.print();
    return;
  }
  cleanup();

  const format = bill.dataset.printFormat || 'thermal80';
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PAGE_CSS[format] || PAGE_CSS.thermal80;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.dataset.format = format;
  root.appendChild(bill.cloneNode(true));
  document.body.appendChild(root);
  document.body.classList.add('printing-bill');

  const done = () => {
    window.removeEventListener('afterprint', done);
    cleanup();
  };
  window.addEventListener('afterprint', done);
  // Let the clone lay out (and its images decode) before the print dialog opens.
  requestAnimationFrame(() => setTimeout(() => window.print(), 50));
}
